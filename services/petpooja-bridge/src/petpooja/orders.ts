import type { BridgeConfig } from "../config.ts";
import type { Logger } from "../logger.ts";
import { BridgeError } from "../errors.ts";
import { idempotentPost } from "../http.ts";
import {
  extractOrderArray,
  extractTotalRecords,
  normalizeOrder,
} from "./normalize.ts";
import type { NormalizedOrder, OrderPage, OrdersResult } from "./order-types.ts";

// The intranet order-listing endpoint proven live:
//   POST http://<host>:9080/intranet_api/inner_order_listing
export const INTRANET_ROUTE_BASE = "/intranet_api";
export const ORDER_LISTING_ROUTE = "inner_order_listing";

// This module is READ ONLY. Only endpoints in this set may be called from here,
// and the guard below refuses anything else. Route names that mutate state are
// never referenced.
export const READ_ONLY_INTRANET_ENDPOINTS: ReadonlySet<string> = new Set([
  ORDER_LISTING_ROUTE,
]);

export function assertReadOnlyEndpoint(route: string): void {
  if (!READ_ONLY_INTRANET_ENDPOINTS.has(route)) {
    throw new BridgeError(
      "not_supported",
      `Refusing to call non-read endpoint '${route}' from the read-only order module`,
    );
  }
}

const DEFAULT_PER_PAGE = 50;
const MAX_PAGES = 200; // hard ceiling so pagination can never loop forever

export type OrderSearch = {
  fromDate: string;
  toDate: string;
  sortOrder?: "ASC" | "DESC";
};

// The proven "search" object shape. Only documented fields are set; the rest
// stay empty exactly as in the working request.
export function buildSearchObject(search: OrderSearch): Record<string, string> {
  return {
    order_from_date: search.fromDate,
    order_to_date: search.toDate,
    order_status: "",
    payment_type: "",
    order_type: "",
    sort_order: search.sortOrder ?? "DESC",
    search_text: "",
    order_source: "",
    settlement_status: "",
    invoice_status: "",
  };
}

export type PageParams = {
  pageNo: number;
  perPage: number;
  search: OrderSearch;
};

// Build the exact proven form body for inner_order_listing.
export function buildOrderListingBody(config: BridgeConfig, params: PageParams): string {
  const body = new URLSearchParams();
  body.set("rest_id", config.restId ?? "");
  body.set("page_no", String(params.pageNo));
  body.set("per_page", String(params.perPage));
  body.set("see_all_orders", "true");
  body.set("show_autoaccept_orders", "false");
  body.set("user", config.user ?? "");
  body.set("search", JSON.stringify(buildSearchObject(params.search)));
  return body.toString();
}

function requireContext(config: BridgeConfig): void {
  if (!config.restId || !config.user) {
    throw new BridgeError(
      "invalid_request",
      "PETPOOJA_REST_ID and PETPOOJA_USER are required for order listing",
    );
  }
}

export async function fetchOrdersPage(
  config: BridgeConfig,
  params: PageParams,
  logger: Logger,
): Promise<OrderPage> {
  requireContext(config);
  assertReadOnlyEndpoint(ORDER_LISTING_ROUTE);

  const url = `${config.petpoojaIntranetUrl}${INTRANET_ROUTE_BASE}/${ORDER_LISTING_ROUTE}`;
  const res = await idempotentPost({
    url,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildOrderListingBody(config, params),
    timeoutMs: config.petpoojaTimeoutMs,
  });

  if (!res.ok) {
    throw new BridgeError("invalid_response", `PetPooja returned HTTP ${res.status}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(res.text.trim());
  } catch {
    logger.warn("order listing returned non-JSON", { pageNo: params.pageNo });
    return { orders: [], totalRecords: null, pageNo: params.pageNo, perPage: params.perPage, raw: res.text };
  }

  const orders = extractOrderArray(json).map(normalizeOrder);
  return {
    orders,
    totalRecords: extractTotalRecords(json),
    pageNo: params.pageNo,
    perPage: params.perPage,
    raw: json,
  };
}

// Remove duplicate orders using the strongest stable identifier available
// (PetPooja order id, then invoice number). Orders with no stable id are all
// kept, because customer/time/amount are NOT safe dedup keys.
export function dedupeOrders(orders: NormalizedOrder[]): {
  orders: NormalizedOrder[];
  duplicatesRemoved: number;
} {
  const seen = new Set<string>();
  const out: NormalizedOrder[] = [];
  let duplicatesRemoved = 0;
  for (const order of orders) {
    const key = order.petpoojaOrderId
      ? `id:${order.petpoojaOrderId}`
      : order.invoiceNo
        ? `inv:${order.invoiceNo}`
        : null;
    if (key === null) {
      out.push(order);
      continue;
    }
    if (seen.has(key)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(key);
    out.push(order);
  }
  return { orders: out, duplicatesRemoved };
}

export type GetOrdersOptions = OrderSearch & {
  perPage?: number;
  maxPages?: number;
};

/**
 * Fetch ALL orders for a date range, paging deterministically until every
 * record is retrieved (or the hard page ceiling is hit), then de-duplicating.
 */
export async function getOrders(
  config: BridgeConfig,
  opts: GetOrdersOptions,
  logger: Logger,
): Promise<OrdersResult> {
  const perPage = opts.perPage && opts.perPage > 0 ? opts.perPage : DEFAULT_PER_PAGE;
  const maxPages = opts.maxPages && opts.maxPages > 0 ? Math.min(opts.maxPages, MAX_PAGES) : MAX_PAGES;
  const search: OrderSearch = { fromDate: opts.fromDate, toDate: opts.toDate, sortOrder: opts.sortOrder };

  const first = await fetchOrdersPage(config, { pageNo: 1, perPage, search }, logger);
  const collected: NormalizedOrder[] = [...first.orders];
  let pagesFetched = 1;

  const totalRecords = first.totalRecords;
  if (totalRecords !== null && totalRecords > collected.length) {
    const totalPages = Math.min(Math.ceil(totalRecords / perPage), maxPages);
    for (let pageNo = 2; pageNo <= totalPages; pageNo++) {
      const page = await fetchOrdersPage(config, { pageNo, perPage, search }, logger);
      pagesFetched += 1;
      if (page.orders.length === 0) break; // deterministic stop: nothing more
      collected.push(...page.orders);
      if (collected.length >= totalRecords) break;
    }
  }

  const { orders, duplicatesRemoved } = dedupeOrders(collected);
  return {
    fromDate: opts.fromDate,
    toDate: opts.toDate,
    orders,
    totalRecords,
    pagesFetched,
    duplicatesRemoved,
  };
}
