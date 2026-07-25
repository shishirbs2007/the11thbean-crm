import type { BridgeConfig } from "../config.ts";
import { PETPOOJA_ROUTE_BASE } from "./capabilities.ts";

// Low-level PetPooja protocol helpers. This layer knows how to build a URL for
// a known route, how to spot a version-incompatibility response, and how to
// read a response defensively (PetPooja's exact shapes are not assumed).

export function routeUrl(baseUrl: string, route: string): string {
  return `${baseUrl.replace(/\/$/, "")}${PETPOOJA_ROUTE_BASE}/${route}`;
}

// Substrings that indicate the local server is too old / protocol-incompatible.
// The canonical observed message is "Please update server app".
const VERSION_INCOMPATIBLE_MARKERS = [
  "update server app",
  "please update",
  "version mismatch",
  "unsupported version",
];

export function isVersionIncompatible(responseText: string): boolean {
  const lower = responseText.toLowerCase();
  return VERSION_INCOMPATIBLE_MARKERS.some((m) => lower.includes(m));
}

export type ParsedResponse = {
  json: unknown | null;
  raw: string;
};

export function parseResponse(text: string): ParsedResponse {
  const trimmed = text.trim();
  if (!trimmed) return { json: null, raw: text };
  try {
    return { json: JSON.parse(trimmed), raw: text };
  } catch {
    return { json: null, raw: text };
  }
}

// Best-effort request fields for the sync-code check. These use ONLY configured
// values (sync code, server_version) and never a guessed server_version. The
// exact field names PetPooja expects are not yet validated; the probe reports
// what the live server actually accepts.
export function syncCheckForm(config: BridgeConfig): {
  body: string;
  contentType: string;
} {
  const params = new URLSearchParams();
  if (config.syncCode) params.set("sync_code", config.syncCode);
  if (config.serverVersion) params.set("server_version", config.serverVersion);
  return {
    body: params.toString(),
    contentType: "application/x-www-form-urlencoded",
  };
}

// Pull a human-readable restaurant identity out of an unknown response shape
// without assuming a specific schema.
export function extractRestaurantIdentity(json: unknown): {
  id?: string;
  name?: string;
} {
  if (!json || typeof json !== "object") return {};
  const obj = json as Record<string, unknown>;
  const idKeys = ["restaurant_id", "restaurantid", "res_id", "restId", "id"];
  const nameKeys = ["restaurant_name", "restaurantname", "res_name", "name"];
  const pick = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (typeof v === "number") return String(v);
    }
    return undefined;
  };
  return { id: pick(idKeys), name: pick(nameKeys) };
}
