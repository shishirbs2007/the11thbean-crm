import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();

let regularId = "";
let drifterId = "";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

test.describe.serial("Business intelligence", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    const { data: people, error: peopleError } = await admin
      .from("people")
      .insert([
        {
          first_name: `Steady${timestamp}`,
          last_name: "Regular",
          email: `steady-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
        {
          first_name: `Drifting${timestamp}`,
          last_name: "Regular",
          email: `drifting-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
      ])
      .select("id");

    if (peopleError) throw peopleError;
    regularId = people[0].id;
    drifterId = people[1].id;

    // A weekly regular who is still coming, and one who came weekly for
    // months and then stopped — far past their own rhythm.
    const { error: visitError } = await admin.from("visits").insert([
      ...[28, 21, 14, 7, 1].map((daysAgo) => ({
        person_id: regularId,
        visited_at: isoDaysAgo(daysAgo),
        visit_type: "walk_in",
        party_size: 2,
        net_amount: 500,
        source: "manual",
      })),
      ...[120, 113, 106, 99].map((daysAgo) => ({
        person_id: drifterId,
        visited_at: isoDaysAgo(daysAgo),
        visit_type: "walk_in",
        party_size: 1,
        net_amount: 400,
        source: "manual",
      })),
    ]);

    if (visitError) throw visitError;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    for (const personId of [regularId, drifterId].filter(Boolean)) {
      await admin.from("hospitality_tasks").delete().eq("person_id", personId);
      await admin.from("timeline_entries").delete().eq("person_id", personId);
      await admin.from("visits").delete().eq("person_id", personId);
      await admin
        .from("customer_health_history")
        .delete()
        .eq("person_id", personId);
      await admin.from("customer_health").delete().eq("person_id", personId);
      await admin.from("people").delete().eq("id", personId);
    }
  });

  test("every measure carries a value, an explanation and an action", async ({
    page,
  }) => {
    await page.goto("/intelligence");

    const measures = page.getByRole("region", { name: "Every measure" });

    await expect(measures.getByText("Revenue", { exact: true })).toBeVisible();
    await expect(measures.getByText("Repeat rate", { exact: true })).toBeVisible();

    // A number with nowhere to go is a dead end; each one links to its rows.
    await expect(
      measures.getByRole("link", { name: "Where this comes from" }).first(),
    ).toBeVisible();
  });

  test("counts the revenue recorded in the period", async ({ page }) => {
    await page.goto("/intelligence?period=30");

    const measures = page.getByRole("region", { name: "Every measure" });

    // Five visits at 500 each in the last 30 days, and nothing else recorded
    // for these fixtures, so the figures are exact.
    await expect(measures.getByText("₹2,500", { exact: true })).toBeVisible();
    await expect(measures.getByText("₹500", { exact: true })).toBeVisible();
  });

  test("names the regular who is overdue against their own rhythm", async ({
    page,
  }) => {
    await page.goto("/intelligence");

    const drifting = page.getByRole("region", {
      name: "Regulars drifting away",
    });

    await expect(drifting.getByText(`Drifting${timestamp}`)).toBeVisible();
    await expect(drifting.getByText(/Usually in every/)).toBeVisible();

    // The guest who is still coming weekly is not flagged.
    await expect(drifting.getByText(`Steady${timestamp}`)).toHaveCount(0);
  });

  test("forecasts the week and says how far to trust it", async ({ page }) => {
    await page.goto("/intelligence");

    const forecast = page.getByRole("region", {
      name: "What the week should look like",
    });

    await expect(forecast.getByRole("listitem")).toHaveCount(7);
    await expect(
      forecast.getByText(/Average of the last|No history for this weekday/).first(),
    ).toBeVisible();
  });

  test("changes period when a different range is chosen", async ({ page }) => {
    await page.goto("/intelligence");

    await page.getByRole("link", { name: "Last 7 days" }).click();

    await expect(page).toHaveURL(/period=7/);
    await expect(
      page.getByRole("link", { name: "Last 7 days" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("reports the café's busiest trading hour", async ({ page }) => {
    await page.goto("/intelligence");

    const rhythm = page.getByRole("region", { name: "When the café is busy" });

    await expect(rhythm.getByText(/Busiest:/)).toBeVisible();
  });
});
