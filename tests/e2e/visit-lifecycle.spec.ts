import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const orderReference = `E2E-${Date.now()}`;

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

test.describe.serial("Visit lifecycle", () => {
  test.afterAll(async () => {
    const admin = adminClient();

    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("order_reference", orderReference);

    for (const visit of visits ?? []) {
      await admin
        .from("timeline_entries")
        .delete()
        .eq("source_type", "visit")
        .eq("source_id", visit.id);

      await admin
        .from("visits")
        .delete()
        .eq("id", visit.id);
    }
  });

  test("record and open a guest visit", async ({ page }) => {
    await page.goto("/visits");

    await page
      .getByPlaceholder("Gross amount")
      .fill("500");

    await page
      .getByPlaceholder("Discount")
      .fill("50");

    await page
      .getByPlaceholder("Tax")
      .fill("25");

    await page
      .getByPlaceholder("Order reference")
      .fill(orderReference);

    await page
      .getByPlaceholder("Visit context")
      .fill("Automated production visit test.");

    await page
      .getByRole("button", { name: "Record visit" })
      .click();

    await expect(page).toHaveURL(/\/visits\/[0-9a-f-]+/);

    await expect(
      page.getByText(orderReference),
    ).toBeVisible();

    await expect(
      page.getByText("₹475"),
    ).toBeVisible();
  });
});
