import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AuthKey } from "./config.ts";
import { BridgeError } from "./errors.ts";

// Inbound request authentication. The CRM signs each request with a shared
// secret over a canonical string that binds method, path, body, a timestamp
// and a one-time nonce. The bridge re-derives and compares in constant time,
// rejects stale timestamps, and rejects replayed nonces.

export const AUTH_HEADERS = {
  keyId: "x-bridge-key-id",
  timestamp: "x-bridge-timestamp",
  nonce: "x-bridge-nonce",
  signature: "x-bridge-signature",
} as const;

export function canonicalString(parts: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: string;
}): string {
  const bodyHash = createHash("sha256").update(parts.body).digest("hex");
  return [parts.timestamp, parts.nonce, parts.method, parts.path, bodyHash].join("\n");
}

function equalHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// Bounded, self-pruning store of recently seen nonces for replay protection.
export class NonceStore {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly max: number;

  constructor(ttlMs: number, max = 10_000) {
    this.ttlMs = ttlMs;
    this.max = max;
  }

  // Returns false if the nonce was already used (a replay).
  register(nonce: string, now: number): boolean {
    this.prune(now);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, now + this.ttlMs);
    if (this.seen.size > this.max) {
      const oldest = this.seen.keys().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    return true;
  }

  private prune(now: number): void {
    for (const [nonce, expiry] of this.seen) {
      if (expiry <= now) this.seen.delete(nonce);
    }
  }
}

export type VerifyInput = {
  headers: Record<string, string | undefined>;
  method: string;
  path: string;
  body: string;
};

// Verifies a request and returns the authenticated key id, or throws
// BridgeError("unauthorized"). Fails closed on anything missing or malformed.
export function verifyRequest(
  input: VerifyInput,
  opts: {
    authKeys: AuthKey[];
    maxClockSkewMs: number;
    nonces: NonceStore;
    now?: number;
  },
): string {
  const now = opts.now ?? Date.now();
  const keyId = input.headers[AUTH_HEADERS.keyId];
  const timestamp = input.headers[AUTH_HEADERS.timestamp];
  const nonce = input.headers[AUTH_HEADERS.nonce];
  const signature = input.headers[AUTH_HEADERS.signature];

  if (!keyId || !timestamp || !nonce || !signature) {
    throw new BridgeError("unauthorized", "Missing authentication headers");
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > opts.maxClockSkewMs) {
    throw new BridgeError("unauthorized", "Stale or invalid timestamp");
  }

  const key = opts.authKeys.find((k) => k.keyId === keyId);
  if (!key) {
    throw new BridgeError("unauthorized", "Unknown key id");
  }

  const canonical = canonicalString({
    timestamp,
    nonce,
    method: input.method,
    path: input.path,
    body: input.body,
  });
  const expected = createHmac("sha256", key.secret).update(canonical).digest("hex");
  if (!equalHex(expected, signature)) {
    throw new BridgeError("unauthorized", "Signature mismatch");
  }

  // Only consume the nonce after the signature is proven valid.
  if (!opts.nonces.register(nonce, now)) {
    throw new BridgeError("unauthorized", "Replayed nonce");
  }

  return keyId;
}
