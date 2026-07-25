import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type BridgeConfig } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { PetPoojaAdapter } from "../src/petpooja/adapter.ts";

function config(): BridgeConfig {
  return loadConfig({
    PETPOOJA_BASE_URL: "http://127.0.0.1:9",
    PETPOOJA_SYNC_CODE: "SYNC1",
    PETPOOJA_TIMEOUT_MS: "500",
  });
}

function adapter(): PetPoojaAdapter {
  return new PetPoojaAdapter(config(), createLogger({ level: "error", write: () => {} }));
}

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: () => Promise.resolve(typeof payload === "string" ? payload : JSON.stringify(payload)),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PetPoojaAdapter.getStatus", () => {
  it("reports offline when PetPooja is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    const status = await adapter().getStatus();
    expect(status.online).toBe(false);
    expect(status.restaurant?.syncCodePresent).toBe(true);
    expect(status.capabilities.status).toBe("untested");
  });

  it("confirms status and identity on a compatible response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ restaurant_id: "42", restaurant_name: "The 11th Bean" })),
    );
    const status = await adapter().getStatus();
    expect(status.online).toBe(true);
    expect(status.restaurant?.name).toBe("The 11th Bean");
    expect(status.restaurant?.id).toBe("42");
    expect(status.version?.compatible).toBe(true);
    expect(status.capabilities.status).toBe("confirmed");
  });

  it("flags a version mismatch without confirming status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("Please update server app")));
    const status = await adapter().getStatus();
    expect(status.online).toBe(true);
    expect(status.version?.compatible).toBe(false);
    expect(status.version?.note).toMatch(/server_version/i);
    expect(status.capabilities.status).toBe("untested");
  });
});

describe("PetPoojaAdapter.getMenu", () => {
  it("extracts items from a nested listing", async () => {
    const payload = {
      status: "1",
      data: [
        { itemid: "1", itemname: "Brownie", price: "100" },
        { itemid: "2", itemname: "Cookie", price: 70 },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(payload)));
    const menu = await adapter().getMenu();
    expect(menu.items).toHaveLength(2);
    expect(menu.items[0]).toMatchObject({ id: "1", name: "Brownie", price: 100 });
    expect(menu.items[1]).toMatchObject({ id: "2", name: "Cookie", price: 70 });
  });

  it("throws version_incompatible on the update message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("Please update server app")));
    await expect(adapter().getMenu()).rejects.toMatchObject({ code: "version_incompatible" });
  });

  it("returns no items for a malformed (non-JSON) response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse("<html>not json</html>")));
    const menu = await adapter().getMenu();
    expect(menu.items).toEqual([]);
  });
});

describe("PetPoojaAdapter.notSupported", () => {
  it("refuses operations without a validated endpoint", async () => {
    await expect(adapter().notSupported("order.create")).rejects.toMatchObject({
      code: "not_supported",
    });
  });
});
