import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The Supabase project that holds real customer records. Tests that create or
 * delete business data must never point at it, whatever the local environment
 * happens to say.
 */
const PRODUCTION_SUPABASE_URL = "https://ehbkxldhajgcununyfat.supabase.co";

function normaliseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

export function isProductionSupabase(url: string | undefined): boolean {
  if (!url) return false;
  return normaliseUrl(url) === normaliseUrl(PRODUCTION_SUPABASE_URL);
}

/**
 * Environments that hold disposable data. Until a hosted staging project
 * exists, "local" is the working target: a Supabase stack on this machine,
 * seeded from the same migrations as production.
 */
const WRITABLE_ENVIRONMENTS = ["local", "staging"] as const;

export type WritableEnvironment = (typeof WRITABLE_ENVIRONMENTS)[number];

function isWritableEnvironment(
  value: string | undefined,
): value is WritableEnvironment {
  return WRITABLE_ENVIRONMENTS.includes(value as WritableEnvironment);
}

/**
 * Guards every write-enabled suite. Three conditions must all hold before a
 * test is allowed to insert or delete anything:
 *
 *   1. CRM_E2E_ALLOW_WRITES is explicitly "true"
 *   2. CRM_E2E_ENVIRONMENT is "local" or "staging"
 *   3. The configured Supabase project is not production
 *
 * Any missing or mismatched value aborts the run rather than falling back to
 * something permissive.
 */
export function assertWritesAllowed(): void {
  const allowWrites = process.env.CRM_E2E_ALLOW_WRITES;
  const environment = process.env.CRM_E2E_ENVIRONMENT;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (allowWrites !== "true") {
    throw new Error(
      "Write-enabled end-to-end tests are disabled. Set CRM_E2E_ALLOW_WRITES=true " +
        "and point the suite at a local or staging Supabase project.",
    );
  }

  if (!isWritableEnvironment(environment)) {
    throw new Error(
      "Write-enabled end-to-end tests require CRM_E2E_ENVIRONMENT to be one of " +
        `${WRITABLE_ENVIRONMENTS.join(", ")}, received ` +
        `${environment ? `"${environment}"` : "no value"}.`,
    );
  }

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is required to verify the target environment.",
    );
  }

  if (isProductionSupabase(supabaseUrl)) {
    throw new Error(
      "Refusing to run write-enabled tests against the production Supabase project. " +
        "Configure the staging project credentials before running this suite.",
    );
  }
}

/**
 * A service-role client for seeding and tearing down fixtures. Only ever
 * handed out once the environment guard has passed.
 */
export function stagingAdminClient(): SupabaseClient {
  assertWritesAllowed();

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
