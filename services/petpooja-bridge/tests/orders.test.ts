import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, type BridgeConfig } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { normalizeOrder } from "../src/petpooja/normalize.ts";
import {
  assertReadOnlyEndpoint,
  buildOrderListingBody,
  buildSearchObject,
  dedupeOrders,
  getOrders,
  READ_ONLY_INTRANET_ENDPOINTS,
} from "../src/petpooja/orders.ts";
import {
  listingResponse,
  rawFullOrder,
  rawOrderMissingCustomer,
  rawOrderMissingMobile,
} from "./fixtures/orders.ts";

const logger = createLogger({ level: "error", write: () => {} });

function config(): BridgeConfig {
  return loadConfig({
    PETPOOJA_INTRANET_URL: "http://127.0.0.1:9080",
    PETPOOJA_REST_ID: "5jnmy55w",
    PETPOOJA_USER: "serialized-user-blob",
    PETPOOJA_TIMEOUT_MS: "500",
  });
}

function okJson(obj: unknown) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(JSON.stringify(obj)),
  } as unknown as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeOrder", () => {
  it("maps a full order, items, payments and KOT", () => {
    const o = normalizeOrder(rawFullOrder());
    expect(o.petpoojaOrderId).toBe("1001");
    expect(o.invoiceNo).toBe("INV-1001");
    expect(o.grandTotal).toBe(263);
    expect(o.subtotal).toBe(260);
    expect(o.discount).toBe(10);
    expect(o.taxes).toBe(12.5);
    expect(o.roundOff).toBe(0.5);
    expect(o.customerName).toBe("Test Guest");
    expect(o.customerMobile).toBe("9990000011");
    expect(o.items).toHaveLength(2);
    expect(o.items[0]).toMatchObject({ name: "Brownie", quantity: 2, unitPrice: 100, total: 200 });
    expect(o.items[1]).toMatchObject({ discount: 10, taxes: 2.5 });
    expect(o.payments).toHaveLength(2);
    expect(o.payments[0]).toMatchObject({ type: "Cash", amount: 163 });
    expect(o.payments[1]).toMatchObject({ type: "UPI", reference: "UPIREF123" });
    expect(o.kots[0]).toMatchObject({ kotId: "K-1" });
    expect(o.raw).toBeDefined();
  });

  it("handles a missing customer", () => {
    const o = normalizeOrder(rawOrderMissingCustomer());
    expect(o.customerName).toBeNull();
    expect(o.customerMobile).toBeNull();
  });

  it("handles a customer with a name but no mobile", () => {
    const o = normalizeOrder(rawOrderMissingMobile());
    expect(o.customerName).toBe("Named Guest");
    expect(o.customerMobile).toBeNull();
  });
});

describe("dedupeOrders", () => {
  it("removes duplicates by stable order id", () => {
    const a = normalizeOrder(rawFullOrder({ orderID: "1" }));
    const b = normalizeOrder(rawFullOrder({ orderID: "1" })); // same id, legit duplicate row
    const c = normalizeOrder(rawFullOrder({ orderID: "2" }));
    const { orders, duplicatesRemoved } = dedupeOrders([a, b, c]);
    expect(orders).toHaveLength(2);
    expect(duplicatesRemoved).toBe(1);
  });

  it("keeps orders that share customer/time/amount but differ in id", () => {
    const base = { customer_name: "Same", customer_phone: "9990000000", grand_total: "100", created_on: "2026-07-25 10:00:00" };
    const a = normalizeOrder(rawFullOrder({ ...base, orderID: "10", invoice_no: "INV-10" }));
    const b = normalizeOrder(rawFullOrder({ ...base, orderID: "11", invoice_no: "INV-11" }));
    const { orders, duplicatesRemoved } = dedupeOrders([a, b]);
    expect(orders).toHaveLength(2);
    expect(duplicatesRemoved).toBe(0);
  });
});

describe("buildSearchObject / buildOrderListingBody", () => {
  it("constructs the proven date-range search with DESC default", () => {
    const search = buildSearchObject({ fromDate: "2026-07-01", toDate: "2026-07-25" });
    expect(search).toMatchObject({
      order_from_date: "2026-07-01",
      order_to_date: "2026-07-25",
      sort_order: "DESC",
      order_status: "",
    });
  });

  it("builds the form body with all proven parameters", () => {
    const body = buildOrderListingBody(config(), {
      pageNo: 1,
      perPage: 10,
      search: { fromDate: "2026-07-25", toDate: "2026-07-25" },
    });
    const params = new URLSearchParams(body);
    expect(params.get("rest_id")).toBe("5jnmy55w");
    expect(params.get("page_no")).toBe("1");
    expect(params.get("per_page")).toBe("10");
    expect(params.get("see_all_orders")).toBe("true");
    expect(params.get("show_autoaccept_orders")).toBe("false");
    expect(params.get("user")).toBe("serialized-user-blob");
    expect(JSON.parse(params.get("search")!)).toMatchObject({ order_to_date: "2026-07-25" });
  });
});

describe("getOrders pagination", () => {
  it("fetches multiple pages until all records are retrieved", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(listingResponse([rawFullOrder({ orderID: "1" })], 2)))
      .mockResolvedValueOnce(okJson(listingResponse([rawFullOrder({ orderID: "2" })], 2)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrders(config(), { fromDate: "2026-07-25", toDate: "2026-07-25", perPage: 1 }, logger);
    expect(result.orders).toHaveLength(2);
    expect(result.pagesFetched).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates orders that repeat across pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(listingResponse([rawFullOrder({ orderID: "1" })], 3)))
      .mockResolvedValueOnce(okJson(listingResponse([rawFullOrder({ orderID: "1" })], 3)))
      .mockResolvedValueOnce(okJson(listingResponse([rawFullOrder({ orderID: "2" })], 3)));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getOrders(config(), { fromDate: "2026-07-25", toDate: "2026-07-25", perPage: 1, maxPages: 5 }, logger);
    expect(result.orders.map((o) => o.petpoojaOrderId).sort()).toEqual(["1", "2"]);
    expect(result.duplicatesRemoved).toBe(1);
  });

  it("returns zero orders for an empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okJson(listingResponse([], 0))));
    const result = await getOrders(config(), { fromDate: "2026-07-25", toDate: "2026-07-25" }, logger);
    expect(result.orders).toHaveLength(0);
    expect(result.totalRecords).toBe(0);
  });

  it("degrades gracefully on a malformed (non-JSON) response", async () => {
    const bad = { ok: true, status: 200, text: () => Promise.resolve("<html>nope</html>") } as unknown as Response;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(bad));
    const result = await getOrders(config(), { fromDate: "2026-07-25", toDate: "2026-07-25" }, logger);
    expect(result.orders).toHaveLength(0);
  });

  it("requires rest_id and user", async () => {
    const cfg = loadConfig({ PETPOOJA_INTRANET_URL: "http://127.0.0.1:9080" });
    await expect(
      getOrders(cfg, { fromDate: "2026-07-25", toDate: "2026-07-25" }, logger),
    ).rejects.toMatchObject({ code: "invalid_request" });
  });
});

describe("read-only safety", () => {
  it("only allows the order-listing read endpoint", () => {
    expect([...READ_ONLY_INTRANET_ENDPOINTS]).toEqual(["inner_order_listing"]);
    expect(() => assertReadOnlyEndpoint("inner_order_listing")).not.toThrow();
    expect(() => assertReadOnlyEndpoint("save_order")).toThrowError(/read-only/i);
    expect(() => assertReadOnlyEndpoint("update_order_status")).toThrow();
  });

  it("the order module source references no PetPooja write routes", () => {
    const forbidden = [
      "save_order",
      "place_order",
      "update_order",
      "delete_order",
      "cancel_order",
      "settle_order",
      "void_order",
      "edit_order",
      "modify_order",
      "save_kot",
      "print_bill",
    ];
    for (const file of ["../src/petpooja/orders.ts", "../src/orders-cli.ts"]) {
      const src = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
      for (const token of forbidden) expect(src).not.toContain(token);
    }
  });
});
