import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AUTH_HEADERS, canonicalString, NonceStore, verifyRequest } from "../src/auth.ts";
import type { AuthKey } from "../src/config.ts";

const KEY: AuthKey = { keyId: "crm-primary", secret: "super-secret-value" };
const PATH = "/v1/op";
const BODY = JSON.stringify({ op: "status", params: {} });

function headersFor(opts: {
  timestamp?: string;
  nonce?: string;
  secret?: string;
  keyId?: string;
}): Record<string, string> {
  const timestamp = opts.timestamp ?? Date.now().toString();
  const nonce = opts.nonce ?? "nonce-1";
  const canonical = canonicalString({ timestamp, nonce, method: "POST", path: PATH, body: BODY });
  const signature = createHmac("sha256", opts.secret ?? KEY.secret).update(canonical).digest("hex");
  return {
    [AUTH_HEADERS.keyId]: opts.keyId ?? KEY.keyId,
    [AUTH_HEADERS.timestamp]: timestamp,
    [AUTH_HEADERS.nonce]: nonce,
    [AUTH_HEADERS.signature]: signature,
  };
}

function verify(headers: Record<string, string>, nonces = new NonceStore(60_000)) {
  return verifyRequest(
    { headers, method: "POST", path: PATH, body: BODY },
    { authKeys: [KEY], maxClockSkewMs: 60_000, nonces },
  );
}

describe("verifyRequest", () => {
  it("accepts a correctly signed request", () => {
    expect(verify(headersFor({}))).toBe(KEY.keyId);
  });

  it("rejects missing auth headers", () => {
    expect(() => verify({})).toThrowError(/authentication headers/i);
  });

  it("rejects a stale timestamp", () => {
    const old = (Date.now() - 10 * 60_000).toString();
    expect(() => verify(headersFor({ timestamp: old }))).toThrowError(/timestamp/i);
  });

  it("rejects an unknown key id", () => {
    expect(() => verify(headersFor({ keyId: "ghost" }))).toThrowError(/key id/i);
  });

  it("rejects a bad signature", () => {
    expect(() => verify(headersFor({ secret: "wrong-secret" }))).toThrowError(/signature/i);
  });

  it("rejects a replayed nonce", () => {
    const nonces = new NonceStore(60_000);
    const headers = headersFor({ nonce: "replay-me" });
    expect(verify(headers, nonces)).toBe(KEY.keyId);
    // Same nonce, freshly signed timestamp — still a replay.
    const replay = headersFor({ nonce: "replay-me" });
    expect(() => verify(replay, nonces)).toThrowError(/replay/i);
  });
});
