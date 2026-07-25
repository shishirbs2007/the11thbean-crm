// Vendor-neutral point-of-sale provider contract.
//
// The CRM depends on this interface, never on PetPooja internals. PetPooja is
// one implementation (reached through the local bridge). Swapping the backend
// later means writing a new POSProvider, not touching the CRM.

export type ProviderErrorCode =
  | "unauthorized"
  | "provider_unavailable" // the POS backend (or the bridge to it) is offline
  | "timeout"
  | "version_incompatible"
  | "not_supported" // the operation is not offered by this provider
  | "invalid_request"
  | "invalid_response"
  | "rate_limited"
  | "unknown";

export type ProviderResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ProviderErrorCode;
      message: string;
      retryable: boolean;
      details?: unknown;
    };

// How well we understand a given capability. We never report "confirmed"
// unless it has actually been demonstrated against a live backend.
export type CapabilitySupport =
  | "confirmed" // A — demonstrated to work
  | "discovered" // B — seen in the app/source but not yet validated
  | "untested" // B — plausible but not exercised
  | "unsupported" // C — known not to exist
  | "unknown"; // C — no evidence either way

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

export type CapabilityMatrix = Record<CapabilityKey, CapabilitySupport>;

export type RestaurantIdentity = {
  id?: string;
  name?: string;
  syncCodePresent: boolean;
};

export type VersionInfo = {
  serverVersion?: string;
  appVersion?: string;
  compatible: boolean;
  note?: string;
};

export type PosStatus = {
  provider: string;
  online: boolean;
  restaurant?: RestaurantIdentity;
  version?: VersionInfo;
  capabilities: CapabilityMatrix;
};

export type MenuItem = {
  id: string;
  name: string;
  price: number | null;
  category: string | null;
  available: boolean | null;
  raw?: unknown;
};

export type Menu = {
  items: MenuItem[];
  fetchedAt: string;
};

export type CustomerQuery = {
  phone?: string;
  name?: string;
  externalId?: string;
};

export type Customer = {
  externalId?: string;
  name?: string;
  phone?: string;
  email?: string;
  raw?: unknown;
};

export type OrderLineInput = {
  itemId: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  notes?: string;
};

export type CreateOrderInput = {
  // Device-generated idempotency key. The same key must never create two
  // orders in the backend, no matter how many times it is retried.
  clientOrderId: string;
  customer?: CustomerQuery;
  lines: OrderLineInput[];
  note?: string;
};

export type Order = {
  externalId?: string;
  status?: string;
  total?: number | null;
  raw?: unknown;
};

export type Receipt = {
  billNumber?: string;
  total?: number | null;
  text?: string;
  raw?: unknown;
};

export interface POSProvider {
  readonly name: string;

  // Read operations — safe and idempotent.
  getStatus(): Promise<ProviderResult<PosStatus>>;
  getMenu(): Promise<ProviderResult<Menu>>;
  findCustomer(query: CustomerQuery): Promise<ProviderResult<Customer[]>>;
  getOrder(externalId: string): Promise<ProviderResult<Order>>;
  getReceipt(externalId: string): Promise<ProviderResult<Receipt>>;

  // Write operations — must be idempotent on their client-supplied key.
  createCustomer(input: Customer): Promise<ProviderResult<Customer>>;
  createOrder(input: CreateOrderInput): Promise<ProviderResult<Order>>;
}

export function emptyCapabilityMatrix(): CapabilityMatrix {
  return {
    status: "unknown",
    "menu.read": "unknown",
    "customer.read": "unknown",
    "customer.write": "unknown",
    "order.read": "unknown",
    "order.create": "unknown",
    "bill.read": "unknown",
    "payment.read": "unknown",
    printing: "unknown",
  };
}
