import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type {
  CreateOrderInput,
  Customer,
  CustomerQuery,
  Menu,
  Order,
  POSProvider,
  PosStatus,
  ProviderErrorCode,
  ProviderResult,
  Receipt,
} from "./types";

// The single, fixed set of operations the CRM may ask the bridge to perform.
// The bridge enforces the same allowlist; there is no generic proxy.
export const BRIDGE_OPERATIONS = [
  "status",
  "menu.get",
  "customer.find",
  "customer.create",
  "order.get",
  "order.create",
  "receipt.get",
] as const;

export type BridgeOperation = (typeof BRIDGE_OPERATIONS)[number];

export type BridgeClientConfig = {
  baseUrl: string;
  keyId: string;
  secret: string;
  timeoutMs?: number;
};

// Reads the bridge connection from the environment. Returns null when it is not
// configured, so callers can degrade gracefully instead of throwing.
export function bridgeConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): BridgeClientConfig | null {
  const baseUrl = env.PETPOOJA_BRIDGE_URL;
  const keyId = env.PETPOOJA_BRIDGE_KEY_ID;
  const secret = env.PETPOOJA_BRIDGE_SECRET;
  if (!baseUrl || !keyId || !secret) return null;
  const timeoutMs = env.PETPOOJA_BRIDGE_TIMEOUT_MS
    ? Number(env.PETPOOJA_BRIDGE_TIMEOUT_MS)
    : undefined;
  return { baseUrl, keyId, secret, timeoutMs };
}

// Canonical string that both sides sign, binding method, path, body and the
// anti-replay fields together.
export function signingString(parts: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: string;
}): string {
  const bodyHash = createHash("sha256").update(parts.body).digest("hex");
  return [parts.timestamp, parts.nonce, parts.method, parts.path, bodyHash].join(
    "\n",
  );
}

export function sign(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("hex");
}

// Constant-time comparison of two hex signatures.
export function verifySignature(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length === 0 || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function fail<T>(
  code: ProviderErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): ProviderResult<T> {
  return { ok: false, code, message, retryable, details };
}

/**
 * POSProvider implementation that reaches PetPooja through the local bridge.
 * It never talks to PetPooja directly — the bridge, running on the café
 * machine, is the only thing that touches the local/intranet POS.
 */
export class BridgePOSProvider implements POSProvider {
  readonly name = "petpooja";
  private readonly cfg: BridgeClientConfig;

  constructor(cfg: BridgeClientConfig) {
    this.cfg = cfg;
  }

  private async call<T>(
    op: BridgeOperation,
    params: unknown,
  ): Promise<ProviderResult<T>> {
    const path = "/v1/op";
    const body = JSON.stringify({ op, params });
    const timestamp = Date.now().toString();
    const nonce = randomUUID();
    const canonical = signingString({
      timestamp,
      nonce,
      method: "POST",
      path,
      body,
    });
    const signature = sign(this.cfg.secret, canonical);

    let res: Response;
    try {
      res = await fetch(this.cfg.baseUrl.replace(/\/$/, "") + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bridge-key-id": this.cfg.keyId,
          "x-bridge-timestamp": timestamp,
          "x-bridge-nonce": nonce,
          "x-bridge-signature": signature,
        },
        body,
        signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 8000),
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === "TimeoutError";
      return fail<T>(
        isTimeout ? "timeout" : "provider_unavailable",
        isTimeout ? "Bridge request timed out" : "Bridge is unreachable",
        true,
      );
    }

    if (res.status === 401 || res.status === 403) {
      return fail<T>("unauthorized", "Bridge rejected the request", false);
    }
    if (res.status === 429) {
      return fail<T>("rate_limited", "Bridge is rate limiting", true);
    }

    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      return fail<T>("invalid_response", "Bridge returned non-JSON", false);
    }

    if (!isEnvelope(payload)) {
      return fail<T>("invalid_response", "Bridge returned an unexpected shape", false);
    }
    if (!payload.ok) {
      return fail<T>(
        payload.code ?? "unknown",
        payload.message ?? "Bridge operation failed",
        payload.retryable ?? false,
        payload.details,
      );
    }
    return { ok: true, data: payload.data as T };
  }

  getStatus(): Promise<ProviderResult<PosStatus>> {
    return this.call<PosStatus>("status", {});
  }
  getMenu(): Promise<ProviderResult<Menu>> {
    return this.call<Menu>("menu.get", {});
  }
  findCustomer(query: CustomerQuery): Promise<ProviderResult<Customer[]>> {
    return this.call<Customer[]>("customer.find", query);
  }
  getOrder(externalId: string): Promise<ProviderResult<Order>> {
    return this.call<Order>("order.get", { externalId });
  }
  getReceipt(externalId: string): Promise<ProviderResult<Receipt>> {
    return this.call<Receipt>("receipt.get", { externalId });
  }
  createCustomer(input: Customer): Promise<ProviderResult<Customer>> {
    return this.call<Customer>("customer.create", input);
  }
  createOrder(input: CreateOrderInput): Promise<ProviderResult<Order>> {
    return this.call<Order>("order.create", input);
  }
}

type Envelope = {
  ok: boolean;
  data?: unknown;
  code?: ProviderErrorCode;
  message?: string;
  retryable?: boolean;
  details?: unknown;
};

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === "object" && value !== null && "ok" in value;
}
