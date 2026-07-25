import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { capabilityForRoute, scanSourceForRoutes } from "../src/probe.ts";

describe("capabilityForRoute", () => {
  it("maps route names to the capability they most likely serve", () => {
    expect(capabilityForRoute("inner_item_listing")).toBe("menu.read");
    expect(capabilityForRoute("get_customer_details")).toBe("customer.read");
    expect(capabilityForRoute("save_order")).toBe("order.read");
    expect(capabilityForRoute("print_bill")).toBe("bill.read");
    expect(capabilityForRoute("check_sync_code")).toBe("status");
    expect(capabilityForRoute("something_unrelated")).toBeNull();
  });
});

describe("scanSourceForRoutes", () => {
  it("returns an empty list and a note when the source is absent", () => {
    const notes: string[] = [];
    expect(scanSourceForRoutes("/no/such/path/here", notes)).toEqual([]);
    expect(notes.join(" ")).toMatch(/not found/i);
  });

  it("discovers /petpooja_server routes from source files (read-only)", () => {
    const root = mkdtempSync(join(tmpdir(), "pp-src-"));
    mkdirSync(join(root, "js"), { recursive: true });
    writeFileSync(
      join(root, "js", "app.js"),
      `fetch('/petpooja_server/check_sync_code');\n$.post('/petpooja_server/save_order', data);\nurl='/petpooja_server/get_customer';`,
    );
    const notes: string[] = [];
    const routes = scanSourceForRoutes(root, notes);
    expect(routes).toContain("check_sync_code");
    expect(routes).toContain("save_order");
    expect(routes).toContain("get_customer");
  });
});
