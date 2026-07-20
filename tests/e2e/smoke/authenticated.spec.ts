import { expect, test } from "@playwright/test";

const pages = [
  ["/briefing", "Daily briefing"],
  ["/intelligence", "How the café is doing"],
  ["/audiences", "Audiences"],
  ["/campaigns", "Campaigns"],
  ["/automations", "Hospitality automations"],
  ["/dashboard", "Dashboard"],
  ["/search", "Global search"],
  ["/customers", "Customers"],
  ["/households", "Households"],
  ["/visits", "Visits"],
  ["/follow-ups", "Follow-ups"],
  ["/important-dates", "Important dates"],
  ["/insights", "Health and insights"],
  ["/segments", "Segments"],
  ["/loyalty", "Loyalty and stored value"],
  ["/feedback", "Feedback"],
  ["/communities", "Communities"],
  ["/events", "Events"],
  ["/communications", "Email and WhatsApp"],
  ["/operations", "Operational checklists"],
  ["/integrations", "Integrations"],
  ["/tags", "Customer tags"],
  ["/staff", "Staff roles"],
  ["/system", "Is this working?"],
  ["/audit", "Audit trail"],
  ["/settings", "Settings"],
] as const;

test.describe("Authenticated production pages", () => {
  for (const [route, heading] of pages) {
    test(`${route} renders`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response).not.toBeNull();
      expect(response?.status()).toBeLessThan(400);
      await expect(page).not.toHaveURL(/\/login$/);
      await expect(
        page.getByRole("heading", {
          name: heading,
          exact: true,
        }),
      ).toBeVisible();
    });
  }

  test("navigation allows only one open dropdown", async ({ page }) => {
    await page.goto("/dashboard");

    await page
      .getByRole("button", { name: "Intelligence" })
      .click();

    await expect(
      page.getByRole("menuitem", { name: "Insights" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Admin" }).click();

    await expect(
      page.getByRole("menuitem", { name: "Insights" }),
    ).toBeHidden();

    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).toBeVisible();
  });

  test("navigation closes when clicking outside", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Admin" }).click();

    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).toBeVisible();

    await page
      .getByRole("heading", { name: "Dashboard" })
      .click();

    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).toBeHidden();
  });

  test("navigation closes with Escape", async ({ page }) => {
    await page.goto("/dashboard");

    await page.getByRole("button", { name: "Community" }).click();

    await expect(
      page.getByRole("menuitem", { name: "Events" }),
    ).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(
      page.getByRole("menuitem", { name: "Events" }),
    ).toBeHidden();
  });

  test("global search form submits", async ({ page }) => {
    await page.goto("/dashboard");

    const search = page.getByPlaceholder(
      /Search customers, notes, tags/i,
    );

    await search.fill("regression-test");
    await page
      .getByRole("button", { name: "Search", exact: true })
      .click();

    await expect(page).toHaveURL(/\/search\?q=regression-test/);
    await expect(
      page.getByRole("heading", { name: "Global search" }),
    ).toBeVisible();
  });
});
