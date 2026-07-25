import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBridgeServer } from "../src/server.ts";
import { loadConfig } from "../src/config.ts";
import { createLogger } from "../src/logger.ts";
import { canonicalString } from "../src/auth.ts";

const SECRET = "test-secret";
const config = loadConfig({
  BRIDGE_AUTH_KEYS: `crm:${SECRET}`,
  PETPOOJA_BASE_URL: "http://127.0.0.1:9",
});
const server = createBridgeServer(config, createLogger({ level: "error", write: () => {} }));
let base = "";

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

let nonceCounter = 0;
function signedHeaders(body: string, opts: { secret?: string } = {}): Record<string, string> {
  const timestamp = Date.now().toString();
  const nonce = `n-${nonceCounter++}`;
  const canonical = canonicalString({ timestamp, nonce, method: "POST", path: "/v1/op", body });
  const signature = createHmac("sha256", opts.secret ?? SECRET).update(canonical).digest("hex");
  return {
    "content-type": "application/json",
    "x-bridge-key-id": "crm",
    "x-bridge-timestamp": timestamp,
    "x-bridge-nonce": nonce,
    "x-bridge-signature": signature,
  };
}

describe("bridge server", () => {
  it("serves an unauthenticated health check", async () => {
    const res = await fetch(`${base}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "petpooja-bridge" });
  });

  it("rejects an operation with no auth headers", async () => {
    const body = JSON.stringify({ op: "order.get", params: { externalId: "1" } });
    const res = await fetch(`${base}/v1/op`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    expect(res.status).toBe(401);
  });

  it("rejects a tampered signature", async () => {
    const body = JSON.stringify({ op: "order.get", params: { externalId: "1" } });
    const res = await fetch(`${base}/v1/op`, {
      method: "POST",
      headers: signedHeaders(body, { secret: "wrong" }),
      body,
    });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown operation with 400", async () => {
    const body = JSON.stringify({ op: "wipe_database", params: {} });
    const res = await fetch(`${base}/v1/op`, { method: "POST", headers: signedHeaders(body), body });
    expect(res.status).toBe(400);
  });

  it("accepts a signed request but refuses an unimplemented op with not_supported", async () => {
    const body = JSON.stringify({ op: "order.get", params: { externalId: "BILL-1" } });
    const res = await fetch(`${base}/v1/op`, { method: "POST", headers: signedHeaders(body), body });
    expect(res.status).toBe(501);
    const payload = await res.json();
    expect(payload).toMatchObject({ ok: false, code: "not_supported" });
  });
});
