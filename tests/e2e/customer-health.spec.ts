import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const timestamp = Date.now();
const email = `health-${timestamp}@example.com`;
let personId = "";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase service credentials are required.");
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

test.describe.serial("Customer health intelligence", () => {
  test.beforeAll(async () => {
    const admin = adminClient();

    const { data: person, error: personError } = await admin
      .from("people")
      .insert({
        first_name: `Health${timestamp}`,
        last_name: "Regression",
        email,
        person_type: "customer",
        customer_status: "regular",
        is_active: true,
      })
      .select("id")
      .single();

    if (personError) throw personError;
    personId = person.id;

    const { error: profileError } = await admin
      .from("customer_hospitality_profiles")
      .upsert({
        person_id: personId,
        staff_summary: "Thursday regular who enjoys a Flat White.",
        coffee_preferences: {
          drink: "Flat White",
          milk: "Regular",
        },
        allergies: ["Peanuts"],
      });

    if (profileError) throw profileError;

    const { data: visitRows, error: visitError } = await admin
      .from("visits")
      .insert([
        buildVisit(0),
        buildVisit(7),
      ])
      .select("id");

    if (visitError) throw visitError;

    // Two visits, both with a Cortado and a Croissant, so the CRM can infer
    // "their usual" from order history rather than the staff note.
    const { error: itemError } = await admin.from("visit_items").insert(
      visitRows.flatMap((visit) => [
        {
          visit_id: visit.id,
          item_name: "Cortado",
          category: "coffee",
          quantity: 1,
          unit_price: 220,
          total_amount: 220,
        },
        {
          visit_id: visit.id,
          item_name: "Croissant",
          category: "bakery",
          quantity: 1,
          unit_price: 180,
          total_amount: 180,
        },
      ]),
    );

    if (itemError) throw itemError;
  });

  function buildVisit(daysAgo: number) {
    return {
      person_id: personId,
      visited_at: new Date(
        Date.now() - daysAgo * 24 * 60 * 60 * 1000,
      ).toISOString(),
      visit_type: "walk_in",
      party_size: 2,
      gross_amount: 500,
      discount_amount: 50,
      tax_amount: 25,
      net_amount: 475,
      source: "manual",
    };
  }

  test.afterAll(async () => {
    const admin = adminClient();

    if (!personId) return;

    await admin.from("customer_health_history").delete().eq("person_id", personId);
    await admin.from("customer_health").delete().eq("person_id", personId);
    await admin.from("timeline_entries").delete().eq("person_id", personId);
    await admin.from("visits").delete().eq("person_id", personId);
    await admin.from("customer_hospitality_profiles").delete().eq("person_id", personId);
    await admin.from("people").delete().eq("id", personId);
  });

  test("shows health metrics and suggestions", async ({ page }) => {
    await page.goto(`/customers/${personId}`);

    const health = page.getByRole("region", { name: "Customer health" });
    const suggestions = page.getByRole("region", {
      name: "Hospitality suggestions",
    });

    await expect(health).toBeVisible();
    await expect(suggestions).toBeVisible();
    await expect(suggestions.getByText(/Flat White/)).toBeVisible();
    await expect(suggestions.getByText(/Peanuts/)).toBeVisible();
  });

  test("infers the usual order from recorded order history", async ({
    page,
  }) => {
    await page.goto(`/customers/${personId}`);

    const health = page.getByRole("region", { name: "Customer health" });

    // Ordered on both visits, so the till outranks the staff note of "Flat White".
    await expect(health.getByText("Cortado", { exact: true })).toBeVisible();
    await expect(health.getByText("Croissant", { exact: true })).toBeVisible();
  });

  test("scores relationships and referrals without manual entry", async ({
    page,
  }) => {
    await page.goto(`/customers/${personId}`);

    const health = page.getByRole("region", { name: "Customer health" });

    await expect(
      health.getByText("Relationship score", { exact: true }),
    ).toBeVisible();
    await expect(
      health.getByText("Community engagement", { exact: true }),
    ).toBeVisible();
    await expect(
      health.getByText("Referral impact", { exact: true }),
    ).toBeVisible();
  });
});
