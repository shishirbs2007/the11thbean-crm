import http from "node:http";
import { loadConfig, secretsOf, type BridgeConfig } from "./config.ts";
import { createLogger, type Logger } from "./logger.ts";
import { NonceStore, verifyRequest } from "./auth.ts";
import { isOperation, validateParams } from "./allowlist.ts";
import { BridgeError, toBridgeError } from "./errors.ts";
import { PetPoojaAdapter } from "./petpooja/adapter.ts";

const MAX_BODY_BYTES = 256 * 1024;
const RATE_LIMIT = { windowMs: 60_000, max: 120 };

type RateState = { count: number; resetAt: number };

function rateLimited(store: Map<string, RateState>, keyId: string, now: number): boolean {
  const state = store.get(keyId);
  if (!state || state.resetAt <= now) {
    store.set(keyId, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return false;
  }
  state.count += 1;
  return state.count > RATE_LIMIT.max;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BridgeError("invalid_request", "Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body);
}

async function dispatch(
  adapter: PetPoojaAdapter,
  op: string,
  params: unknown,
): Promise<unknown> {
  switch (op) {
    case "status":
      return adapter.getStatus();
    case "menu.get":
      return adapter.getMenu();
    case "customer.find":
    case "customer.create":
    case "order.get":
    case "order.create":
    case "receipt.get":
      return adapter.notSupported(op);
    default:
      throw new BridgeError("not_supported", `Unknown operation '${op}'`);
  }
}

export function createBridgeServer(config: BridgeConfig, logger: Logger): http.Server {
  const nonces = new NonceStore(config.maxClockSkewMs);
  const rate = new Map<string, RateState>();
  const adapter = new PetPoojaAdapter(config, logger);

  return http.createServer((req, res) => {
    void handle(req, res).catch((err) => {
      const be = toBridgeError(err);
      logger.error("unhandled bridge error", { code: be.code, message: be.message });
      send(res, be.httpStatus, {
        ok: false,
        code: be.code,
        message: be.message,
        retryable: be.retryable,
      });
    });
  });

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${config.host}`);
    const path = url.pathname;

    // Liveness — no auth, no PetPooja call, no secrets.
    if (req.method === "GET" && path === "/health") {
      send(res, 200, { status: "ok", service: "petpooja-bridge", time: new Date().toISOString() });
      return;
    }

    if (req.method !== "POST" || path !== "/v1/op") {
      send(res, 404, { ok: false, code: "invalid_request", message: "Not found", retryable: false });
      return;
    }

    const body = await readBody(req);
    const headers: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      headers[k] = Array.isArray(v) ? v[0] : v;
    }

    let keyId: string;
    try {
      keyId = verifyRequest({ headers, method: "POST", path, body }, {
        authKeys: config.authKeys,
        maxClockSkewMs: config.maxClockSkewMs,
        nonces,
      });
    } catch (err) {
      const be = toBridgeError(err);
      logger.warn("auth rejected", { code: be.code });
      send(res, be.httpStatus, { ok: false, code: be.code, message: be.message, retryable: false });
      return;
    }

    if (rateLimited(rate, keyId, Date.now())) {
      send(res, 429, { ok: false, code: "rate_limited", message: "Too many requests", retryable: true });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      send(res, 400, { ok: false, code: "invalid_request", message: "Body is not JSON", retryable: false });
      return;
    }

    const op = (parsed as { op?: unknown })?.op;
    if (!isOperation(op)) {
      send(res, 400, { ok: false, code: "invalid_request", message: "Unknown or missing operation", retryable: false });
      return;
    }

    let params: unknown;
    try {
      params = validateParams(op, (parsed as { params?: unknown }).params);
    } catch (err) {
      const be = toBridgeError(err);
      send(res, be.httpStatus, { ok: false, code: be.code, message: be.message, retryable: false, details: be.details });
      return;
    }

    logger.info("operation", { op, keyId });
    try {
      const data = await dispatch(adapter, op, params);
      send(res, 200, { ok: true, data });
    } catch (err) {
      const be = toBridgeError(err);
      logger.warn("operation failed", { op, code: be.code, message: be.message });
      send(res, be.httpStatus, {
        ok: false,
        code: be.code,
        message: be.message,
        retryable: be.retryable,
        details: be.details,
      });
    }
  }
}

// Start the server when run directly (node --experimental-strip-types server.ts).
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel, secrets: secretsOf(config) });
  if (config.authKeys.length === 0) {
    logger.error("refusing to start: BRIDGE_AUTH_KEYS is not set (bridge would be unauthenticated)");
    process.exit(1);
  }
  const server = createBridgeServer(config, logger);
  server.listen(config.port, config.host, () => {
    logger.info("bridge listening", {
      host: config.host,
      port: config.port,
      petpoojaBaseUrl: config.petpoojaBaseUrl,
      keys: config.authKeys.length,
    });
  });
}
