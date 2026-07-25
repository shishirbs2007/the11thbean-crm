// Error classification shared across the bridge. The `code` values line up with
// the CRM's ProviderErrorCode so the wire envelope maps cleanly on both sides.

export type BridgeErrorCode =
  | "unauthorized"
  | "provider_unavailable"
  | "timeout"
  | "version_incompatible"
  | "not_supported"
  | "invalid_request"
  | "invalid_response"
  | "rate_limited"
  | "unknown";

export class BridgeError extends Error {
  readonly code: BridgeErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: unknown;

  constructor(
    code: BridgeErrorCode,
    message: string,
    opts: { httpStatus?: number; retryable?: boolean; details?: unknown } = {},
  ) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.httpStatus = opts.httpStatus ?? defaultStatus(code);
    this.retryable = opts.retryable ?? defaultRetryable(code);
    this.details = opts.details;
  }
}

function defaultStatus(code: BridgeErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "invalid_request":
      return 400;
    case "not_supported":
      return 501;
    case "rate_limited":
      return 429;
    case "timeout":
      return 504;
    case "provider_unavailable":
      return 502;
    case "version_incompatible":
      return 502;
    case "invalid_response":
      return 502;
    default:
      return 500;
  }
}

function defaultRetryable(code: BridgeErrorCode): boolean {
  return code === "timeout" || code === "provider_unavailable" || code === "rate_limited";
}

// Turn any thrown value into a BridgeError without losing classification.
export function toBridgeError(err: unknown): BridgeError {
  if (err instanceof BridgeError) return err;
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return new BridgeError("timeout", "Operation timed out");
    }
    return new BridgeError("unknown", err.message);
  }
  return new BridgeError("unknown", "Unknown error");
}
