import type { BridgeConfig } from "../config.ts";
import type { Logger } from "../logger.ts";
import { BridgeError } from "../errors.ts";
import { idempotentPost } from "../http.ts";
import {
  baseMatrix,
  KNOWN_ENDPOINTS,
  type CapabilityMatrix,
} from "./capabilities.ts";
import {
  extractRestaurantIdentity,
  isVersionIncompatible,
  parseResponse,
  routeUrl,
  syncCheckForm,
} from "./protocol.ts";

export type AdapterStatus = {
  provider: "petpooja";
  online: boolean;
  restaurant?: { id?: string; name?: string; syncCodePresent: boolean };
  version?: { serverVersion?: string; compatible: boolean; note?: string };
  capabilities: CapabilityMatrix;
};

export type AdapterMenuItem = {
  id: string;
  name: string;
  price: number | null;
  category: string | null;
  available: boolean | null;
  raw?: unknown;
};

export type AdapterMenu = { items: AdapterMenuItem[]; fetchedAt: string };

/**
 * Speaks the PetPooja local protocol. Only the two evidenced endpoints are
 * wired; every other operation reports `not_supported` rather than guessing a
 * route. Reads are idempotent; nothing here writes to PetPooja.
 */
export class PetPoojaAdapter {
  private readonly config: BridgeConfig;
  private readonly logger: Logger;

  constructor(config: BridgeConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async getStatus(): Promise<AdapterStatus> {
    const capabilities = baseMatrix();
    const syncCodePresent = Boolean(this.config.syncCode);
    const form = syncCheckForm(this.config);

    let res;
    try {
      res = await idempotentPost({
        url: routeUrl(this.config.petpoojaBaseUrl, KNOWN_ENDPOINTS.checkSyncCode),
        headers: { "content-type": form.contentType },
        body: form.body,
        timeoutMs: this.config.petpoojaTimeoutMs,
      });
    } catch (err) {
      // Offline / unreachable is a reported state, not a thrown error.
      this.logger.warn("petpooja unreachable during status", {
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        provider: "petpooja",
        online: false,
        restaurant: { syncCodePresent },
        capabilities,
      };
    }

    const incompatible = isVersionIncompatible(res.text);
    const parsed = parseResponse(res.text);
    const identity = extractRestaurantIdentity(parsed.json);

    if (res.ok && !incompatible) {
      // A successful, compatible round-trip demonstrates the status capability.
      capabilities.status = "confirmed";
    }

    return {
      provider: "petpooja",
      online: true,
      restaurant: { ...identity, syncCodePresent },
      version: {
        serverVersion: this.config.serverVersion ?? undefined,
        compatible: !incompatible,
        note: incompatible
          ? "PetPooja reported a version/protocol mismatch (e.g. 'Please update server app'). Set the correct PETPOOJA_SERVER_VERSION."
          : undefined,
      },
      capabilities,
    };
  }

  async getMenu(): Promise<AdapterMenu> {
    const form = syncCheckForm(this.config);
    const res = await idempotentPost({
      url: routeUrl(this.config.petpoojaBaseUrl, KNOWN_ENDPOINTS.innerItemListing),
      headers: { "content-type": form.contentType },
      body: form.body,
      timeoutMs: this.config.petpoojaTimeoutMs,
    });

    if (isVersionIncompatible(res.text)) {
      throw new BridgeError(
        "version_incompatible",
        "PetPooja rejected inner_item_listing due to version. Set the correct PETPOOJA_SERVER_VERSION.",
      );
    }
    if (!res.ok) {
      throw new BridgeError("invalid_response", `PetPooja returned HTTP ${res.status}`);
    }

    const parsed = parseResponse(res.text);
    const items = extractItems(parsed.json);
    return { items, fetchedAt: new Date().toISOString() };
  }

  // The following operations have no evidenced endpoint yet. We refuse rather
  // than invent a route or send speculative traffic to the POS.
  async notSupported(op: string): Promise<never> {
    throw new BridgeError(
      "not_supported",
      `Operation '${op}' has no validated PetPooja endpoint yet. Run the read-only probe on the cafe machine to discover it.`,
    );
  }
}

function firstArrayOfObjects(json: unknown, depth = 0): unknown[] | null {
  if (depth > 4 || json === null || typeof json !== "object") return null;
  if (Array.isArray(json)) {
    return json.some((el) => el && typeof el === "object") ? json : null;
  }
  for (const value of Object.values(json as Record<string, unknown>)) {
    const found = firstArrayOfObjects(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

// Defensive menu extraction. PetPooja's exact shape is unvalidated, so we look
// for the first array of objects and map recognisable name/price/id fields,
// keeping the raw record for later inspection.
function extractItems(json: unknown): AdapterMenuItem[] {
  const arr = firstArrayOfObjects(json);
  if (!arr) return [];
  return arr
    .filter((el): el is Record<string, unknown> => Boolean(el) && typeof el === "object")
    .map((el) => ({
      id: pickString(el, ["itemid", "item_id", "id", "item_code"]) ?? "",
      name: pickString(el, ["itemname", "item_name", "name", "title"]) ?? "",
      price: pickNumber(el, ["price", "rate", "amount", "mrp"]),
      category: pickString(el, ["category", "categoryname", "category_name"]) ?? null,
      available: null,
      raw: el,
    }))
    .filter((item) => item.name !== "");
}
