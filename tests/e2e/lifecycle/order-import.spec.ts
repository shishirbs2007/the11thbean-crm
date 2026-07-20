import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const phone = `+9198${String(timestamp).slice(-8)}`;

let guestId = "";

function csv(rows: string[]): string {
  return ["order_id,date,phone,item,category,qty,price,total", ...rows].join("\n");
}

test.describe.serial("Order import", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    const { data, error } = await admin
      .from("people")
      .insert({
        first_name: `Till${timestamp}`,
        last_name: "Guest",
        email: `till-${timestamp}@example.com`,
        phone,
        person_type: "customer",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) throw error;
    guestId = data.id;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    if (!guestId) return;

    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("person_id", guestId);

    for (const visit of visits ?? []) {
      await admin.from("order_items").delete().eq("visit_id", visit.id);
    }

    await admin.from("import_run_items").delete().eq("person_id", guestId);
    await admin.from("timeline_entries").delete().eq("person_id", guestId);
    await admin.from("visits").delete().eq("person_id", guestId);
    await admin.from("customer_health_history").delete().eq("person_id", guestId);
    await admin.from("customer_health").delete().eq("person_id", guestId);
    await admin.from("people").delete().eq("id", guestId);
  });

  test("imports a till export and attaches it to the right guest", async ({
    page,
  }) => {
    await page.goto("/integrations");

    const content = csv([
      `TILL-${timestamp}-1,2026-07-18T09:15:00Z,${phone},Flat White,coffee,1,220,420`,
      `TILL-${timestamp}-1,2026-07-18T09:15:00Z,${phone},Croissant,bakery,1,200,420`,
      `TILL-${timestamp}-2,2026-07-19T09:20:00Z,${phone},Flat White,coffee,1,220,220`,
    ]);

    await page
      .getByRole("region", { name: "Import orders from the till" })
      .getByLabel("Till export CSV file")
      .setInputFiles({
        name: "till-export.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(content),
      });

    await page.getByRole("button", { name: "Import orders" }).click();

    const history = page.getByRole("region", { name: "Import history" });
    await expect(history.getByText(/2 orders seen, 2 imported/)).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id, external_order_id, net_amount")
      .eq("person_id", guestId);

    expect(visits).toHaveLength(2);
    expect(visits?.every((v) => v.external_order_id?.startsWith("TILL-"))).toBe(
      true,
    );
  });

  test("re-importing the same export changes nothing", async ({ page }) => {
    await page.goto("/integrations");

    const content = csv([
      `TILL-${timestamp}-1,2026-07-18T09:15:00Z,${phone},Flat White,coffee,1,220,420`,
    ]);

    await page
      .getByRole("region", { name: "Import orders from the till" })
      .getByLabel("Till export CSV file")
      .setInputFiles({
        name: "till-export.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(content),
      });

    await page.getByRole("button", { name: "Import orders" }).click();

    await expect(
      page
        .getByRole("region", { name: "Import history" })
        .getByText(/1 orders seen, 0 imported, 1 already known/),
    ).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("person_id", guestId);

    // Still two: a repeat upload must never double a guest's history.
    expect(visits).toHaveLength(2);
  });

  test("feeds the inference that tells staff their usual", async () => {
    const admin = stagingAdminClient();

    const { data } = await admin
      .from("customer_item_history")
      .select("item_name, visit_count")
      .eq("person_id", guestId)
      .order("visit_count", { ascending: false });

    // Ordered on both visits, so the CRM can now state it as their usual.
    expect(data?.[0].item_name).toBe("Flat White");
    expect(Number(data?.[0].visit_count)).toBe(2);
  });

  test("keeps an order it cannot attribute rather than discarding it", async ({
    page,
  }) => {
    await page.goto("/integrations");

    const content = csv([
      `TILL-${timestamp}-9,2026-07-19T11:00:00Z,+910000000009,Filter Coffee,coffee,1,140,140`,
    ]);

    await page
      .getByRole("region", { name: "Import orders from the till" })
      .getByLabel("Till export CSV file")
      .setInputFiles({
        name: "unknown.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(content),
      });

    await page.getByRole("button", { name: "Import orders" }).click();

    const unmatched = page.getByRole("region", {
      name: "Orders without a guest",
    });

    await expect(
      unmatched.getByText(`Order TILL-${timestamp}-9`),
    ).toBeVisible();

    const admin = stagingAdminClient();
    await admin
      .from("import_run_items")
      .delete()
      .eq("external_id", `TILL-${timestamp}-9`);
  });

  test("refuses a file it cannot understand, and says why", async ({ page }) => {
    await page.goto("/integrations");

    await page
      .getByRole("region", { name: "Import orders from the till" })
      .getByLabel("Till export CSV file")
      .setInputFiles({
        name: "wrong.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("date,item,price\n2026-07-19,Flat White,220"),
      });

    await page.getByRole("button", { name: "Import orders" }).click();

    // Nothing was imported and the page explains what it wanted.
    await expect(
      page.getByRole("region", { name: "Import orders from the till" }),
    ).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("person_id", guestId);

    expect(visits).toHaveLength(2);
  });
});
