// PetPooja capability catalogue.
//
// Honesty rules for this file:
//  - We only name an `endpoint` when we have concrete evidence it exists.
//  - Two endpoints are evidenced so far (both category B — discovered but not
//    yet validated against a compatible server):
//        /petpooja_server/check_sync_code
//        /petpooja_server/inner_item_listing
//  - Everything else is category C: endpoint unknown. It stays "unknown"
//    until the read-only probe (run on the cafe machine, with access to the
//    running app and the extracted source) proves otherwise.
//  - Nothing is ever "confirmed" here. Confirmation only comes from a live,
//    demonstrated probe result.

export type CapabilitySupport =
  | "confirmed"
  | "discovered"
  | "untested"
  | "unsupported"
  | "unknown";

export type CapabilityKey =
  | "status"
  | "menu.read"
  | "customer.read"
  | "customer.write"
  | "order.read"
  | "order.create"
  | "bill.read"
  | "payment.read"
  | "printing";

export type CapabilityCategory = "A" | "B" | "C";

export type CapabilityDescriptor = {
  key: CapabilityKey;
  endpoint: string | null;
  category: CapabilityCategory;
  support: CapabilitySupport;
  notes: string;
};

export const PETPOOJA_ROUTE_BASE = "/petpooja_server";

// The only endpoints with real evidence behind them.
export const KNOWN_ENDPOINTS = {
  checkSyncCode: "check_sync_code",
  innerItemListing: "inner_item_listing",
  // Proven live (POST /intranet_api/inner_order_listing) — returns full order,
  // invoice, customer, item, tax, discount and payment data.
  innerOrderListing: "inner_order_listing",
} as const;

export const CAPABILITY_CATALOG: readonly CapabilityDescriptor[] = [
  {
    key: "status",
    endpoint: KNOWN_ENDPOINTS.checkSyncCode,
    category: "B",
    support: "untested",
    notes:
      "Reachability, restaurant identity and version compatibility inferred from check_sync_code. Not yet validated end to end.",
  },
  {
    key: "menu.read",
    endpoint: KNOWN_ENDPOINTS.innerItemListing,
    category: "B",
    support: "untested",
    notes:
      "inner_item_listing previously returned 'Please update server app'; requires the correct server_version before it can be validated.",
  },
  {
    key: "customer.read",
    endpoint: null,
    category: "C",
    support: "unknown",
    notes: "Endpoint unknown. Discover via the probe on the cafe machine.",
  },
  {
    key: "customer.write",
    endpoint: null,
    category: "C",
    support: "unknown",
    notes: "Endpoint unknown and write-capable; must be validated carefully before any use.",
  },
  {
    key: "order.read",
    endpoint: KNOWN_ENDPOINTS.innerOrderListing,
    category: "B",
    support: "discovered",
    notes:
      "Proven live via /intranet_api/inner_order_listing (paginated date-range listing). Validate end to end with `npm run petpooja:orders`.",
  },
  {
    key: "order.create",
    endpoint: null,
    category: "C",
    support: "unknown",
    notes: "Endpoint unknown and write-capable; requires idempotency design before use.",
  },
  {
    key: "bill.read",
    endpoint: KNOWN_ENDPOINTS.innerOrderListing,
    category: "B",
    support: "discovered",
    notes:
      "Invoice/bill fields are carried in the inner_order_listing response; extracted by the order normalizer. Not yet validated as a standalone endpoint.",
  },
  {
    key: "payment.read",
    endpoint: KNOWN_ENDPOINTS.innerOrderListing,
    category: "B",
    support: "discovered",
    notes:
      "Payment fields are carried in the inner_order_listing response; extracted by the order normalizer.",
  },
  {
    key: "printing",
    endpoint: null,
    category: "C",
    support: "unknown",
    notes: "Printing flow unknown. Must never be triggered during discovery.",
  },
];

export type CapabilityMatrix = Record<CapabilityKey, CapabilitySupport>;

export function baseMatrix(): CapabilityMatrix {
  const matrix = {} as CapabilityMatrix;
  for (const cap of CAPABILITY_CATALOG) matrix[cap.key] = cap.support;
  return matrix;
}
