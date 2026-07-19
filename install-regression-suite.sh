#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
LOG="$ROOT/regression-suite-install.log"

exec > >(tee -a "$LOG") 2>&1

fail() {
  echo
  echo "REGRESSION SUITE INSTALL FAILED"
  echo "Command: $BASH_COMMAND"
  echo "Log: $LOG"
}
trap fail ERR

write_file() {
  local path="$1"
  mkdir -p "$(dirname "$path")"
  cat > "$path"
}

npm install --save-dev @playwright/test
npx playwright install chromium

node <<'NODE'
const fs = require("fs");

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

pkg.scripts = {
  ...pkg.scripts,
  "test:public": "playwright test --config=playwright.production.config.ts --project=public",
  "test:auth": "playwright test --config=playwright.production.config.ts --project=authenticated",
  "test:e2e": "playwright test --config=playwright.production.config.ts",
  "test:db": "node tests/database/integrity.mjs",
  "test:report": "playwright show-report",
  "validate:production": "bash ./validate-production.sh"
};

fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
NODE

write_file "playwright.production.config.ts" <<'TS'
import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  "https://the11thbean-crm.vercel.app";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "test-results",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "playwright-report",
        open: "never",
      },
    ],
    [
      "junit",
      {
        outputFile: "test-results/results.xml",
      },
    ],
  ],
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "public",
      testMatch: /public\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "authenticated",
      dependencies: ["auth-setup"],
      testIgnore: /public\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/user.json",
      },
    },
  ],
});
TS

write_file "tests/e2e/public.spec.ts" <<'TS'
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

  test("unknown route returns the application not-found page", async ({
    page,
  }) => {
    const response = await page.goto("/this-route-must-not-exist");

    expect(response).not.toBeNull();
    expect(response?.status()).toBe(404);
  });
});
TS

write_file "tests/e2e/auth.setup.ts" <<'TS'
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
TS

write_file "tests/e2e/authenticated.spec.ts" <<'TS'
import { expect, test } from "@playwright/test";

const pages = [
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
TS

write_file "tests/e2e/customer-lifecycle.spec.ts" <<'TS'
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
    await page.getByPlaceholder("Phone").fill(`9${timestamp}`.slice(0, 10));
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
      page.getByText("Automated regression test note."),
    ).toBeVisible();

    await page.goto("/customers");

    await page
      .getByPlaceholder(/Search name, phone, email/i)
      .fill(email);

    await page
      .getByRole("button", { name: "Search" })
      .click();

    await expect(page.getByText(firstName)).toBeVisible();
  });
});
TS

write_file "tests/e2e/visit-lifecycle.spec.ts" <<'TS'
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
TS

write_file "tests/database/integrity.mjs" <<'JS'
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(2);
}

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const checks = [];

async function check(name, callback) {
  try {
    const result = await callback();

    if (result === true) {
      checks.push({ name, status: "PASS" });
      return;
    }

    checks.push({
      name,
      status: "FAIL",
      detail:
        typeof result === "string"
          ? result
          : JSON.stringify(result),
    });
  } catch (error) {
    checks.push({
      name,
      status: "FAIL",
      detail:
        error instanceof Error ? error.message : String(error),
    });
  }
}

await check("No duplicate customer emails", async () => {
  const { data, error } = await supabase
    .from("people")
    .select("email")
    .not("email", "is", null);

  if (error) throw error;

  const values = data.map((row) => row.email.toLowerCase());
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );

  return duplicates.length === 0
    ? true
    : `Duplicates: ${[...new Set(duplicates)].join(", ")}`;
});

await check("No duplicate customer phones", async () => {
  const { data, error } = await supabase
    .from("people")
    .select("phone")
    .not("phone", "is", null);

  if (error) throw error;

  const values = data.map((row) => row.phone);
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );

  return duplicates.length === 0
    ? true
    : `Duplicates: ${[...new Set(duplicates)].join(", ")}`;
});

await check("Visit amounts are non-negative", async () => {
  const { data, error } = await supabase
    .from("visits")
    .select("id,gross_amount,discount_amount,tax_amount,net_amount")
    .or(
      "gross_amount.lt.0,discount_amount.lt.0,tax_amount.lt.0,net_amount.lt.0",
    );

  if (error) throw error;

  return data.length === 0
    ? true
    : `${data.length} invalid visit rows`;
});

await check("Health scores stay between 0 and 100", async () => {
  const { data, error } = await supabase
    .from("customer_health")
    .select("person_id,health_score,churn_risk")
    .or(
      "health_score.lt.0,health_score.gt.100,churn_risk.lt.0,churn_risk.gt.100",
    );

  if (error) throw error;

  return data.length === 0
    ? true
    : `${data.length} invalid health rows`;
});

await check("Loyalty balances are non-negative", async () => {
  const { data, error } = await supabase
    .from("loyalty_accounts")
    .select("person_id,points_balance,wallet_balance")
    .or("points_balance.lt.0,wallet_balance.lt.0");

  if (error) throw error;

  return data.length === 0
    ? true
    : `${data.length} negative loyalty balances`;
});

await check("Gift-card balances are valid", async () => {
  const { data, error } = await supabase
    .from("gift_cards")
    .select("id,original_value,remaining_value");

  if (error) throw error;

  const invalid = data.filter(
    (row) =>
      Number(row.remaining_value) < 0 ||
      Number(row.remaining_value) > Number(row.original_value),
  );

  return invalid.length === 0
    ? true
    : `${invalid.length} invalid gift cards`;
});

await check("Household primary contacts are members", async () => {
  const { data: households, error } = await supabase
    .from("households")
    .select("id,primary_contact_id")
    .not("primary_contact_id", "is", null);

  if (error) throw error;

  for (const household of households) {
    const { count, error: memberError } = await supabase
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", household.id)
      .eq("person_id", household.primary_contact_id);

    if (memberError) throw memberError;

    if (!count) {
      return `Household ${household.id} has a non-member primary contact`;
    }
  }

  return true;
});

await check("Visit item totals match quantity × price", async () => {
  const { data, error } = await supabase
    .from("visit_items")
    .select("id,quantity,unit_price,total_amount");

  if (error) throw error;

  const invalid = data.filter((row) => {
    const expected =
      Number(row.quantity) * Number(row.unit_price);
    return Math.abs(expected - Number(row.total_amount)) > 0.01;
  });

  return invalid.length === 0
    ? true
    : `${invalid.length} invalid visit-item totals`;
});

await check("All active staff roles are valid", async () => {
  const { data, error } = await supabase
    .from("app_roles")
    .select("user_id,role")
    .eq("is_active", true);

  if (error) throw error;

  const allowed = new Set(["barista", "manager", "admin"]);
  const invalid = data.filter((row) => !allowed.has(row.role));

  return invalid.length === 0
    ? true
    : `${invalid.length} invalid staff roles`;
});

const width = Math.max(...checks.map((item) => item.name.length), 20);

console.log("");
console.log("DATABASE INTEGRITY");
console.log("=".repeat(width + 16));

for (const item of checks) {
  console.log(
    `${item.name.padEnd(width)}  ${item.status.padEnd(5)}  ${
      item.detail || ""
    }`,
  );
}

const failures = checks.filter((item) => item.status === "FAIL");

console.log("");
console.log(
  `${checks.length} checks, ${checks.length - failures.length} passed, ${failures.length} failed`,
);

if (failures.length) {
  process.exit(1);
}
JS

write_file "validate-production.sh" <<'SH'
#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
REPORT_DIR="$ROOT/validation-reports/$STAMP"
LOG="$REPORT_DIR/validation.log"

mkdir -p "$REPORT_DIR"

exec > >(tee "$LOG") 2>&1

status=0

section() {
  echo
  echo "============================================================"
  echo "$1"
  echo "============================================================"
}

run() {
  local name="$1"
  shift

  section "$name"

  if "$@"; then
    echo "$name: PASS"
  else
    echo "$name: FAIL"
    status=1
  fi
}

load_env() {
  if [[ -f ".env.local" ]]; then
    set -a
    # shellcheck disable=SC1091
    source ".env.local"
    set +a
  fi
}

load_env

export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-https://the11thbean-crm.vercel.app}"
export CRM_TEST_USER_EMAIL="${CRM_TEST_USER_EMAIL:-bean@the11thbean.com}"

run "ESLint" npm run lint
run "Production build" npm run build
run "Public browser tests" npm run test:public

if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  run "Authenticated browser tests" npm run test:auth
  run "Database integrity" npm run test:db
else
  section "Authenticated tests"
  echo "SKIPPED"
  echo "Add SUPABASE_SERVICE_ROLE_KEY to .env.local."
  echo "CRM_TEST_USER_EMAIL defaults to bean@the11thbean.com."
  status=1
fi

if [[ -d "playwright-report" ]]; then
  cp -R "playwright-report" "$REPORT_DIR/"
fi

if [[ -d "test-results" ]]; then
  cp -R "test-results" "$REPORT_DIR/"
fi

section "RESULT"

if [[ "$status" -eq 0 ]]; then
  echo "READY FOR PRODUCTION"
else
  echo "VALIDATION FAILED OR INCOMPLETE"
fi

echo "Report: $REPORT_DIR"
exit "$status"
SH

chmod +x validate-production.sh

cat >> .gitignore <<'EOF'

# Automated test output and authentication
playwright/.auth/
playwright-report/
test-results/
validation-reports/
regression-suite-install.log
EOF

npm run lint
npm run build
npm run test:public

git add \
  package.json \
  package-lock.json \
  playwright.production.config.ts \
  tests \
  validate-production.sh \
  .gitignore

git commit -m "Add production regression test suite"
git push
vercel --prod

echo
echo "REGRESSION SUITE INSTALLED"
echo
echo "Full validation:"
echo "  ./validate-production.sh"
echo
echo "Authenticated tests require this in .env.local:"
echo "  SUPABASE_SERVICE_ROLE_KEY=..."
echo
echo "Optional:"
echo "  CRM_TEST_USER_EMAIL=bean@the11thbean.com"
echo "  PLAYWRIGHT_BASE_URL=https://the11thbean-crm.vercel.app"
