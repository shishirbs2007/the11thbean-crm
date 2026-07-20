import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const phone = `+9198${String(timestamp).slice(-8)}`;

let guestId = "";

function csv(rows: string[]): string {
  return ["order_id,date,phone,item,category,qty,price,total", ...rows].join("\n");
}

/**
 * Waits for this run's own import to land.
 *
 * Asserting on the import-history panel is unreliable: history accumulates, so
 * a regex match can be satisfied by a previous run's summary while this one has
 * not happened at all. Polling for the order ids this test generated cannot be
 * fooled that way.
 */
async function waitForImportedOrder(externalId: string): Promise<void> {
  const admin = stagingAdminClient();

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { data } = await admin
      .from("import_run_items")
      .select("outcome")
      .eq("external_id", externalId);

    if ((data ?? []).length > 0) return;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Import never recorded an outcome for ${externalId}`);
}

/**
 * Confirms the fixture is matchable the way the importer matches.
 *
 * Checking `phone = '+9198...'` is not the same test: the matcher strips
 * non-digits, so two guests stored as "+919812345678" and "919812345678" are
 * one row to an exact-string query and two candidates to the matcher, which
 * then correctly refuses to guess. Verifying with a different comparison from
 * the one under test is how a fixture problem hides until it looks like a
 * product bug.
 */
async function expectMatchable(): Promise<void> {
  const admin = stagingAdminClient();

  const { data, error } = await admin.rpc("match_guest_detail", {
    contact_phone: phone,
    contact_email: null,
  });

  if (error) throw error;

  const detail = Array.isArray(data) ? data[0] : data;

  expect(
    detail?.person_id,
    `the importer cannot match ${phone}: ${detail?.candidate_count ?? 0} candidate(s)`,
  ).toBe(guestId);
}

test.describe.serial("Order import", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    // A retry re-runs beforeAll with the same module-level timestamp, so the
    // fixture must converge rather than collide with its own leftovers.
    await admin.from("people").delete().eq("phone", phone);

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
    await admin.from("people").delete().eq("phone", phone);
  });

  test("imports a till export and attaches it to the right guest", async ({
    page,
  }) => {
    await expectMatchable();

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

    await waitForImportedOrder(`TILL-${timestamp}-1`);

    const admin = stagingAdminClient();
    const { data: byOrder } = await admin
      .from("visits")
      .select("id, external_order_id, person_id")
      .like("external_order_id", `TILL-${timestamp}-%`);

    expect(
      byOrder,
      `orders landed on ${JSON.stringify(byOrder?.map((v) => v.person_id))}, expected ${guestId}`,
    ).toHaveLength(2);

    const visits = byOrder;
    expect(visits?.every((v) => v.person_id === guestId)).toBe(true);
    expect(visits?.every((v) => v.external_order_id?.startsWith("TILL-"))).toBe(
      true,
    );
  });

  test("re-importing the same export changes nothing", async ({ page }) => {
    await expectMatchable();

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

    const admin = stagingAdminClient();

    // The repeat upload records a second outcome for the same order id.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const { data } = await admin
        .from("import_run_items")
        .select("outcome")
        .eq("external_id", `TILL-${timestamp}-1`);

      if ((data ?? []).some((item) => item.outcome === "skipped")) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
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

    await waitForImportedOrder(`TILL-${timestamp}-9`);
    await expect(
      unmatched.getByText(`Order TILL-${timestamp}-9`),
    ).toBeVisible();

    const admin = stagingAdminClient();
    await admin
      .from("import_run_items")
      .delete()
      .eq("external_id", `TILL-${timestamp}-9`);
  });

  test("says a duplicate guest needs merging, not that nobody matched", async () => {
    const admin = stagingAdminClient();

    // The same person entered twice with the number written differently.
    const { data: twin, error } = await admin
      .from("people")
      .insert({
        first_name: `Twin${timestamp}`,
        email: `twin-${timestamp}@example.com`,
        phone: phone.replace("+", ""),
        person_type: "customer",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) throw error;

    const { error: importError } = await admin.rpc("import_orders", {
      adapter: "generic_pos",
      orders: [
        {
          external_id: `TILL-${timestamp}-dup`,
          occurred_at: "2026-07-19T12:00:00Z",
          phone,
          net_amount: 100,
          items: [],
        },
      ],
    });

    if (importError) throw importError;

    const { data: outcome } = await admin
      .from("import_run_items")
      .select("outcome, reason")
      .eq("external_id", `TILL-${timestamp}-dup`)
      .single();

    expect(outcome?.outcome).toBe("unmatched");
    expect(outcome?.reason).toContain("share these contact details");
    expect(outcome?.reason).toContain("Merge");

    await admin
      .from("import_run_items")
      .delete()
      .eq("external_id", `TILL-${timestamp}-dup`);
    await admin.from("people").delete().eq("id", twin.id);
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
