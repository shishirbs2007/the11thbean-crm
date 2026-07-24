import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

const migration = read("supabase/migrations/202607240001_fallback_pos.sql");
const actions = read("src/app/(app)/pos/actions.ts");
const page = read("src/app/(app)/pos/page.tsx");

// The standalone release must not read from or write to any CRM/Customer360
// table. These guards fail the build if a future change re-couples the POS.
const CRM_TABLES = [
  "visits",
  "visit_items",
  "order_items",
  "timeline_entries",
  "people",
];

describe("POS migration is self-contained", () => {
  it("creates the canonical pos_* structures", () => {
    expect(migration).toMatch(/create table if not exists public\.pos_orders/);
    expect(migration).toMatch(/create table if not exists public\.pos_order_lines/);
    expect(migration).toMatch(/create table if not exists public\.pos_payments/);
    expect(migration).toMatch(/function public\.pos_checkout/);
  });

  it("does not write to any CRM table", () => {
    for (const table of CRM_TABLES) {
      expect(migration).not.toMatch(
        new RegExp(`insert\\s+into\\s+public\\.${table}\\b`, "i"),
      );
    }
  });

  it("preserves reconciliation fields for later CRM integration", () => {
    expect(migration).toContain("client_order_id");
    expect(migration).toMatch(/source text not null default 'fallback_pos'/);
    // person_id column is retained (nullable) for future linkage.
    expect(migration).toMatch(/person_id uuid references public\.people/);
  });
});

describe("POS server code touches no CRM tables", () => {
  it("actions.ts queries only pos_* tables", () => {
    for (const table of CRM_TABLES) {
      expect(actions).not.toContain(`.from("${table}")`);
    }
  });

  it("page.tsx queries only pos_* tables", () => {
    for (const table of CRM_TABLES) {
      expect(page).not.toContain(`.from("${table}")`);
    }
    expect(page).toContain('.from("pos_orders")');
  });
});
