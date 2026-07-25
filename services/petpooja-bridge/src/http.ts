import { BridgeError } from "./errors.ts";

// Outbound HTTP to the local PetPooja service. Timeouts are enforced, and only
// explicitly-safe reads are retried (with backoff). Writes are never retried
// here — order/customer creation gets idempotency at a higher layer instead.

export type HttpRequest = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

export type HttpResponse = {
  status: number;
  ok: boolean;
  text: string;
};

async function once(req: HttpRequest): Promise<HttpResponse> {
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.method ?? "GET",
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(req.timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new BridgeError("timeout", "PetPooja request timed out");
    }
    throw new BridgeError("provider_unavailable", "PetPooja is unreachable", {
      details: err instanceof Error ? err.message : undefined,
    });
  }
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Perform a safe, retryable read. Retries only on timeout / unreachable.
export async function safeRead(
  req: HttpRequest,
  opts: { retries?: number; backoffMs?: number } = {},
): Promise<HttpResponse> {
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await once({ ...req, method: "GET" });
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof BridgeError && err.retryable;
      if (!retryable || attempt === retries) break;
      await delay(backoff * 2 ** attempt);
    }
  }
  throw lastErr instanceof BridgeError
    ? lastErr
    : new BridgeError("provider_unavailable", "PetPooja read failed");
}

// Perform an idempotent POST read (e.g. a listing/validation endpoint that
// happens to require POST). Retryable, because repeating it has no side effect.
export async function idempotentPost(
  req: HttpRequest,
  opts: { retries?: number; backoffMs?: number } = {},
): Promise<HttpResponse> {
  const retries = opts.retries ?? 2;
  const backoff = opts.backoffMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await once({ ...req, method: "POST" });
    } catch (err) {
      lastErr = err;
      const retryable = err instanceof BridgeError && err.retryable;
      if (!retryable || attempt === retries) break;
      await delay(backoff * 2 ** attempt);
    }
  }
  throw lastErr instanceof BridgeError
    ? lastErr
    : new BridgeError("provider_unavailable", "PetPooja read failed");
}

// Perform a write exactly once. No retries — safety over convenience.
export async function writeOnce(req: HttpRequest): Promise<HttpResponse> {
  return once({ ...req, method: "POST" });
}
