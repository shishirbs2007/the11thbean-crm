/**
 * Integration contracts.
 *
 * The CRM asks for a capability, never for a vendor. Everything above this
 * layer talks in terms of "send this message"; which company actually carries
 * it is decided by configuration and is invisible to every feature.
 */

export type Capability =
  | "orders.import"
  | "customers.sync"
  | "email.send"
  | "whatsapp.send"
  | "sms.send"
  | "push.send"
  | "calendar.sync"
  | "delivery.webhook";

export type OutboundMessage = {
  to: string;
  subject?: string;
  body: string;
  /** Resolved personalization, already substituted. */
  metadata?: Record<string, unknown>;
};

export type SendResult =
  | { ok: true; providerMessageId: string | null }
  | { ok: false; error: string; retryable: boolean };

export type ImportedOrderItem = {
  itemName: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
};

export type ImportedOrder = {
  externalId: string;
  occurredAt: string;
  customerPhone: string | null;
  customerEmail: string | null;
  netAmount: number;
  items: ImportedOrderItem[];
};

export type ImportResult =
  | { ok: true; orders: ImportedOrder[] }
  | { ok: false; error: string; retryable: boolean };

/**
 * What every adapter must provide. An adapter declares its capabilities and
 * implements only those; asking for anything else returns a clear refusal
 * rather than throwing.
 */
export type IntegrationAdapter = {
  key: string;
  label: string;
  capabilities: Capability[];
  /** Environment variables this adapter needs to work. Names only. */
  requiredEnv: string[];
  /** Whether the environment currently satisfies those requirements. */
  isConfigured(): boolean;
  send?(message: OutboundMessage): Promise<SendResult>;
  importOrders?(since: Date): Promise<ImportResult>;
};

export function hasCapability(
  adapter: IntegrationAdapter,
  capability: Capability,
): boolean {
  return adapter.capabilities.includes(capability);
}

/**
 * True when every named variable is present and non-empty. Used to tell staff
 * an adapter is enabled but not yet usable, which is otherwise a confusing
 * silent failure.
 */
export function environmentSatisfied(
  requiredEnv: string[],
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return requiredEnv.every((name) => Boolean(environment[name]?.trim()));
}

export function missingEnvironment(
  requiredEnv: string[],
  environment: Record<string, string | undefined> = process.env,
): string[] {
  return requiredEnv.filter((name) => !environment[name]?.trim());
}
