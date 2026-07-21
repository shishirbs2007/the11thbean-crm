import { expect, test } from "@playwright/test";

import { assertWritesAllowed } from "../support/environment";

/**
 * Accessibility and small-screen checks.
 *
 * Café staff use this on a phone behind a counter, often one-handed and in a
 * hurry. These read only — nothing here creates or deletes a record — but they
 * run in the write-enabled suite because they need a signed-in session.
 */

const PAGES = [
  ["/arrival", "Arrival"],
  ["/briefing", "Daily briefing"],
  ["/customers", "Customers"],
  ["/intelligence", "How the café is doing"],
  ["/events", "Events"],
] as const;

test.describe("Accessibility and small screens", () => {
  test.beforeAll(() => {
    assertWritesAllowed();
  });

  for (const [route, heading] of PAGES) {
    test(`${route} has one main heading and a landmark`, async ({ page }) => {
      await page.goto(route);

      // Exactly one h1: screen-reader users navigate by it.
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        page.getByRole("heading", { level: 1, name: heading }),
      ).toBeVisible();

      await expect(page.getByRole("main")).toBeVisible();
      await expect(page.getByRole("navigation").first()).toBeVisible();
    });
  }

  test("every form control on the briefing is labelled", async ({ page }) => {
    await page.goto("/briefing");

    const controls = page.locator(
      "main input:not([type=hidden]), main select, main textarea",
    );
    const count = await controls.count();

    expect(count).toBeGreaterThan(0);

    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);

      // A control is usable if it carries any of these. Placeholder counts
      // here because the CRM uses placeholder-as-label consistently, and an
      // unlabelled control would expose nothing at all.
      const described = await control.evaluate((element) => {
        const el = element as HTMLInputElement;
        return Boolean(
          el.getAttribute("aria-label") ||
            el.getAttribute("aria-labelledby") ||
            el.getAttribute("placeholder") ||
            (el.id && document.querySelector(`label[for="${el.id}"]`)) ||
            el.closest("label"),
        );
      });

      expect(described, `control ${index} on /briefing has no accessible name`).toBe(
        true,
      );
    }
  });

  test("images carry alternative text", async ({ page }) => {
    await page.goto("/customers");

    const images = page.locator("img");
    const count = await images.count();

    for (let index = 0; index < count; index += 1) {
      const alt = await images.nth(index).getAttribute("alt");
      expect(alt, `image ${index} has no alt attribute`).not.toBeNull();
    }
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    for (const [route] of PAGES) {
      test(`${route} does not scroll sideways`, async ({ page }) => {
        await page.goto(route);

        const overflow = await page.evaluate(() => {
          const doc = document.documentElement;
          return doc.scrollWidth - doc.clientWidth;
        });

        // A couple of pixels is rounding; a horizontal scrollbar is a bug.
        expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(2);
      });
    }

    test("the daily briefing is usable one-handed", async ({ page }) => {
      await page.goto("/briefing");

      await expect(
        page.getByRole("heading", { level: 1, name: "Daily briefing" }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Who to welcome personally today" }),
      ).toBeVisible();
    });
  });
});
