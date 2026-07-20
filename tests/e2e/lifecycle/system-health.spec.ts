import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const marker = `probe-${timestamp}`;

test.describe.serial("System health", () => {
  test.afterAll(async () => {
    const admin = stagingAdminClient();
    await admin.from("system_incidents").delete().eq("area", marker);
    await admin
      .from("system_incidents")
      .delete()
      .contains("context", { file_name: `broken-${timestamp}.csv` });
  });

  test("answers whether the system is working", async ({ page }) => {
    await page.goto("/system");

    await expect(
      page.getByRole("heading", { level: 1, name: "Is this working?" }),
    ).toBeVisible();

    // The overall verdict is stated before any detail.
    await expect(page.getByRole("status")).toBeVisible();
  });

  test("every check says what it measured and what to do", async ({ page }) => {
    await page.goto("/system");

    const checks = page.getByRole("region", { name: "Health checks" });

    for (const label of [
      "Records reaching the CRM",
      "Service recovery backlog",
      "Integration health",
      "Order imports",
    ]) {
      await expect(checks.getByText(label, { exact: true })).toBeVisible();
    }

    // Each check links to the records behind it.
    await expect(
      checks.getByRole("link", { name: "Look at this" }).first(),
    ).toBeVisible();
  });

  test("surfaces a recorded incident and lets staff acknowledge it", async ({
    page,
  }) => {
    const admin = stagingAdminClient();

    const { error } = await admin.rpc("record_incident", {
      incident_area: marker,
      incident_summary: `Something failed quietly ${timestamp}`,
      incident_detail: "Raised by the regression suite.",
      incident_severity: "error",
      incident_context: { source: "regression" },
    });

    if (error) throw error;

    await page.goto("/system");

    const incidents = page.getByRole("region", {
      name: "Unacknowledged incidents",
    });

    const row = incidents
      .getByRole("listitem")
      .filter({ hasText: `Something failed quietly ${timestamp}` });

    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Acknowledge" }).click();

    // Acknowledged incidents leave the list, so the next real one stands out.
    await expect(
      page
        .getByRole("region", { name: "Unacknowledged incidents" })
        .getByText(`Something failed quietly ${timestamp}`),
    ).toHaveCount(0);

    const { data } = await admin
      .from("system_incidents")
      .select("acknowledged_at, acknowledged_by")
      .eq("area", marker)
      .single();

    expect(data?.acknowledged_at).not.toBeNull();
    expect(data?.acknowledged_by).not.toBeNull();
  });

  test("records an import failure that would otherwise be invisible", async ({
    page,
  }) => {
    await page.goto("/integrations");

    await page
      .getByRole("region", { name: "Import orders from the till" })
      .getByLabel("Till export CSV file")
      .setInputFiles({
        name: `broken-${timestamp}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from("date,item,price\n2026-07-19,Flat White,220"),
      });

    await page.getByRole("button", { name: "Import orders" }).click();

    // click() resolves when the click dispatches, not when the server action
    // finishes. Wait for the page to come back before reading the database.
    await expect(
      page.getByRole("region", { name: "Import orders from the till" }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    const admin = stagingAdminClient();

    // Filter on the file name itself: import incidents accumulate across runs,
    // so a "most recent five" query is not a reliable way to find this one.
    const { data } = await admin
      .from("system_incidents")
      .select("id, summary, area, context")
      .eq("area", "import")
      .contains("context", { file_name: `broken-${timestamp}.csv` });

    expect(data).toHaveLength(1);
    expect(data?.[0].summary).toContain("could not be imported");

    await admin
      .from("system_incidents")
      .delete()
      .contains("context", { file_name: `broken-${timestamp}.csv` });
  });

  test("says plainly that nothing outside the CRM is listening", async ({
    page,
  }) => {
    await page.goto("/system");

    const alerting = page.getByRole("region", { name: "Alerting" });

    // No sink is configured yet, and the page must not imply otherwise.
    await expect(
      alerting.getByText("No external alerting is configured."),
    ).toBeVisible();
  });

  test("does not record a guest's details in an incident", async () => {
    const admin = stagingAdminClient();

    const { data } = await admin
      .from("system_incidents")
      .select("context, detail")
      .limit(50);

    for (const incident of data ?? []) {
      const serialised = JSON.stringify(incident);
      expect(serialised).not.toMatch(/@example\.com/);
      expect(serialised).not.toMatch(/\+91\d{10}/);
    }
  });
});
