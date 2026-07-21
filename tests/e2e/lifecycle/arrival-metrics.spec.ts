import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const phone = `+9195${String(timestamp).slice(-8)}`;

let guestId = "";

test.describe.serial("Arrival metrics", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();
    await admin.from("people").delete().eq("phone", phone);

    const { data, error } = await admin
      .from("people")
      .insert({
        first_name: `Metrics${timestamp}`,
        last_name: "Guest",
        email: `metrics-${timestamp}@example.com`,
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
    if (guestId) {
      await admin.from("visits").delete().eq("person_id", guestId);
      await admin.from("timeline_entries").delete().eq("person_id", guestId);
      await admin.from("customer_health_history").delete().eq("person_id", guestId);
      await admin.from("customer_health").delete().eq("person_id", guestId);
      await admin.from("people").delete().eq("id", guestId);
    }
  });

  test("welcoming a guest records an anonymous arrival event", async ({
    page,
  }) => {
    const admin = stagingAdminClient();
    const { count: before } = await admin
      .from("arrival_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "arrival");

    await page.goto("/arrival");
    const search = page.getByLabel("Search for a guest by name or phone");
    await search.fill(`Metrics${timestamp}`);
    await expect(
      page.getByRole("button", { name: new RegExp(`Metrics${timestamp}`) }),
    ).toBeVisible();
    await search.press("Enter");
    await expect(page.getByText(/Welcomed/)).toBeVisible();

    // Metrics are fire-and-forget; give the event a moment to land.
    await expect
      .poll(async () => {
        const { count } = await admin
          .from("arrival_events")
          .select("id", { count: "exact", head: true })
          .eq("event_type", "arrival");
        return count ?? 0;
      })
      .toBeGreaterThan(before ?? 0);
  });

  test("the arrival was recorded as keyboard-driven", async () => {
    const admin = stagingAdminClient();
    const { data } = await admin
      .from("arrival_events")
      .select("input_method, duration_ms")
      .eq("event_type", "arrival")
      .order("occurred_at", { ascending: false })
      .limit(1);

    expect(data?.[0].input_method).toBe("keyboard");
    // The whole interaction was timed and is a plausible counter duration.
    expect(Number(data?.[0].duration_ms)).toBeGreaterThan(0);
    expect(Number(data?.[0].duration_ms)).toBeLessThan(600000);
  });

  test("no event carries anything that identifies a guest or member of staff", async () => {
    const admin = stagingAdminClient();

    // The table has no columns that could hold identity. Assert the shape.
    const { data } = await admin.from("arrival_events").select("*").limit(20);

    for (const event of data ?? []) {
      const keys = Object.keys(event);
      expect(keys).not.toContain("person_id");
      expect(keys).not.toContain("staff_id");
      expect(keys).not.toContain("created_by");
      expect(keys).not.toContain("query");

      const serialised = JSON.stringify(event);
      expect(serialised).not.toMatch(/@example\.com/);
      expect(serialised).not.toMatch(/\+91\d{10}/);
    }
  });

  test("the metrics summary is aggregate and readable", async () => {
    const admin = stagingAdminClient();
    const { data } = await admin.rpc("arrival_metrics", { period_days: 7 });

    const metrics = data as Record<string, unknown>;
    expect(Number(metrics.arrivals)).toBeGreaterThan(0);
    expect(metrics).toHaveProperty("median_arrival_ms");
    expect(metrics).toHaveProperty("keyboard_arrivals");
    // No key in the summary could carry identity.
    expect(Object.keys(metrics)).not.toContain("person_id");
  });
});
