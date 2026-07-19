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

    const { error: visitError } = await admin.from("visits").insert({
      person_id: personId,
      visited_at: new Date().toISOString(),
      visit_type: "walk_in",
      party_size: 2,
      gross_amount: 500,
      discount_amount: 50,
      tax_amount: 25,
      net_amount: 475,
      source: "manual",
    });

    if (visitError) throw visitError;
  });

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

    await expect(page.getByText("Customer health", { exact: true })).toBeVisible();
    await expect(page.getByText("Hospitality suggestions", { exact: true })).toBeVisible();
    await expect(page.getByText(/Flat White/)).toBeVisible();
    await expect(page.getByText(/Peanuts/)).toBeVisible();
  });
});
