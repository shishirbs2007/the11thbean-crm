import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertWritesAllowed,
  isProductionSupabase,
} from "../e2e/support/environment";

const PRODUCTION_URL = "https://ehbkxldhajgcununyfat.supabase.co";
const STAGING_URL = "https://staging-project-ref.supabase.co";

const KEYS = [
  "CRM_E2E_ALLOW_WRITES",
  "CRM_E2E_ENVIRONMENT",
  "NEXT_PUBLIC_SUPABASE_URL",
] as const;

let saved: Record<string, string | undefined> = {};

function setEnvironment(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const key of KEYS) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
}

function stagingEnvironment() {
  return {
    CRM_E2E_ALLOW_WRITES: "true",
    CRM_E2E_ENVIRONMENT: "staging",
    NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
  } as const;
}

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
});

describe("isProductionSupabase", () => {
  it("recognises the production project", () => {
    expect(isProductionSupabase(PRODUCTION_URL)).toBe(true);
  });

  it("ignores a trailing slash, whitespace and casing", () => {
    expect(isProductionSupabase(`  ${PRODUCTION_URL.toUpperCase()}/  `)).toBe(
      true,
    );
  });

  it("does not match the staging project", () => {
    expect(isProductionSupabase(STAGING_URL)).toBe(false);
  });

  it("treats a missing url as not production", () => {
    expect(isProductionSupabase(undefined)).toBe(false);
  });
});

describe("assertWritesAllowed", () => {
  it("permits a fully configured staging run", () => {
    setEnvironment(stagingEnvironment());
    expect(() => assertWritesAllowed()).not.toThrow();
  });

  it("refuses to touch the production project even when flagged staging", () => {
    setEnvironment({
      ...stagingEnvironment(),
      NEXT_PUBLIC_SUPABASE_URL: PRODUCTION_URL,
    });

    expect(() => assertWritesAllowed()).toThrow(/production Supabase project/);
  });

  it("refuses when the write flag is absent", () => {
    setEnvironment({
      CRM_E2E_ENVIRONMENT: "staging",
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
    });

    expect(() => assertWritesAllowed()).toThrow(/CRM_E2E_ALLOW_WRITES=true/);
  });

  it("refuses when the write flag is anything other than true", () => {
    setEnvironment({ ...stagingEnvironment(), CRM_E2E_ALLOW_WRITES: "1" });
    expect(() => assertWritesAllowed()).toThrow(/CRM_E2E_ALLOW_WRITES=true/);
  });

  it("refuses when the environment is not staging", () => {
    setEnvironment({ ...stagingEnvironment(), CRM_E2E_ENVIRONMENT: "production" });
    expect(() => assertWritesAllowed()).toThrow(/received "production"/);
  });

  it("refuses when the environment is unset", () => {
    setEnvironment({
      CRM_E2E_ALLOW_WRITES: "true",
      NEXT_PUBLIC_SUPABASE_URL: STAGING_URL,
    });

    expect(() => assertWritesAllowed()).toThrow(/received no value/);
  });

  it("refuses when the target project is unknown", () => {
    setEnvironment({
      CRM_E2E_ALLOW_WRITES: "true",
      CRM_E2E_ENVIRONMENT: "staging",
    });

    expect(() => assertWritesAllowed()).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is required/,
    );
  });
});
