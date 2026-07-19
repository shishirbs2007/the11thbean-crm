import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test as setup } from "@playwright/test";

const authFile = path.join(
  process.cwd(),
  "playwright/.auth/user.json",
);

setup("authenticate production test user", async ({ page, baseURL }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email =
    process.env.CRM_TEST_USER_EMAIL || "bean@the11thbean.com";

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for authenticated tests.",
    );
  }

  if (!baseURL) {
    throw new Error("Playwright baseURL is not configured.");
  }

  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${baseURL}/auth/callback`,
    },
  });

  if (error) {
    throw error;
  }

  const actionLink = data.properties?.action_link;

  if (!actionLink) {
    throw new Error("Supabase did not return a magic-link action URL.");
  }

  await page.goto(actionLink);
  await page.waitForURL(
    (url) =>
      url.origin === new URL(baseURL).origin &&
      !url.pathname.startsWith("/login"),
    {
      timeout: 30_000,
    },
  );

  await page.goto("/settings");

  await expect(
    page.getByRole("heading", { name: "Settings" }),
  ).toBeVisible();

  await page.context().storageState({
    path: authFile,
  });
});
