import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const timestamp = Date.now();
const firstName = `Regression${timestamp}`;
const email = `regression-${timestamp}@example.com`;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase service credentials are required.",
    );
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

test.describe.serial("Customer lifecycle", () => {
  test.afterAll(async () => {
    const admin = adminClient();

    const { data: people } = await admin
      .from("people")
      .select("id")
      .eq("email", email);

    for (const person of people ?? []) {
      await admin
        .from("timeline_entries")
        .delete()
        .eq("person_id", person.id);

      await admin
        .from("visits")
        .delete()
        .eq("person_id", person.id);

      await admin
        .from("customer_notes")
        .delete()
        .eq("person_id", person.id);

      await admin
        .from("people")
        .delete()
        .eq("id", person.id);
    }
  });

  test("create, find, edit and enrich a customer", async ({ page }) => {
    await page.goto("/customers/new");

    await page.getByPlaceholder("First name").fill(firstName);
    await page.getByPlaceholder("Last name").fill("Automation");
    await page.getByPlaceholder("Preferred name").fill("Regression");
    await page.getByPlaceholder("Email").fill(email);
    await page
      .getByPlaceholder("Phone")
      .fill(`9${timestamp}`.slice(0, 10));

    await page
      .getByRole("button", { name: "Create customer" })
      .click();

    await expect(page).toHaveURL(/\/customers\/[0-9a-f-]+/);

    await expect(
      page.getByRole("heading", {
        name: /Regression Automation/,
      }),
    ).toBeVisible();

    await page
      .getByPlaceholder("Useful hospitality context")
      .fill("Automated regression test note.");

    await page
      .getByRole("button", { name: "Add note" })
      .click();

    await expect(
      page
        .getByText("Automated regression test note.", {
          exact: true,
        })
        .first(),
    ).toBeVisible();

    await page.goto("/customers");

    await page
      .getByPlaceholder(/Search name, phone, email/i)
      .fill(email);

    await page
      .getByRole("button", { name: "Search" })
      .click();

    await expect(
      page.getByText(email, { exact: true }),
    ).toBeVisible();
  });
});
