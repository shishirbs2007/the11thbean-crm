import { expect, test } from "@playwright/test";

test.describe("Public production surface", () => {
  test("homepage loads", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/The 11th Bean CRM/i);

    await expect(
      page.getByRole("heading", {
        name: /Hospitality intelligence/i,
      }),
    ).toBeVisible();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: "Staff sign in" }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Send sign-in link" }),
    ).toBeVisible();
  });

  test("health endpoint returns valid JSON", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.ok()).toBeTruthy();

    const body = await response.json();

    expect(body.status).toBe("ok");
    expect(body.service).toContain("11th Bean");
    expect(Date.parse(body.timestamp)).not.toBeNaN();
  });

  const protectedRoutes = [
    "/briefing",
    "/intelligence",
    "/audiences",
    "/campaigns",
    "/automations",
    "/dashboard",
    "/search",
    "/customers",
    "/households",
    "/visits",
    "/follow-ups",
    "/important-dates",
    "/insights",
    "/segments",
    "/loyalty",
    "/feedback",
    "/communities",
    "/events",
    "/communications",
    "/operations",
    "/integrations",
    "/tags",
    "/staff",
    "/audit",
    "/settings",
  ];

  for (const route of protectedRoutes) {
    test(`${route} redirects unauthenticated users`, async ({ page }) => {
      await page.goto(route);

      await expect(page).toHaveURL(/\/login$/);

      await expect(
        page.getByRole("heading", { name: "Staff sign in" }),
      ).toBeVisible();
    });
  }

  test("unknown routes are protected", async ({ page }) => {
    const response = await page.goto("/this-route-must-not-exist");

    expect(response).not.toBeNull();

    await expect(page).toHaveURL(/\/login$/);

    await expect(
      page.getByRole("heading", {
        name: "Staff sign in",
      }),
    ).toBeVisible();

    await expect(page.locator("body")).not.toContainText(
      /Application error|Unhandled Runtime Error|Internal Server Error/i,
    );
  });
});
