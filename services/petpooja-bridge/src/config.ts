// Bridge configuration, entirely environment-driven. No secret is ever
// hard-coded or committed; everything sensitive comes from the process
// environment (typically a gitignored .env loaded with `node --env-file`).

export type LogLevel = "debug" | "info" | "warn" | "error";

export type AuthKey = { keyId: string; secret: string };

export type BridgeConfig = {
  petpoojaBaseUrl: string;
  syncCode: string | null;
  serverVersion: string | null;
  port: number;
  host: string;
  authKeys: AuthKey[];
  maxClockSkewMs: number;
  petpoojaTimeoutMs: number;
  logLevel: LogLevel;
};

const DEFAULTS = {
  petpoojaBaseUrl: "http://127.0.0.1:8965",
  port: 8787,
  host: "127.0.0.1",
  maxClockSkewMs: 300_000,
  petpoojaTimeoutMs: 8_000,
  logLevel: "info" as LogLevel,
};

// Parse "keyId:secret,keyId2:secret2" into structured auth keys, ignoring
// blanks and malformed entries.
export function parseAuthKeys(raw: string | undefined): AuthKey[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(":");
      if (idx <= 0 || idx === pair.length - 1) return null;
      return { keyId: pair.slice(0, idx), secret: pair.slice(idx + 1) };
    })
    .filter((k): k is AuthKey => k !== null);
}

function num(value: string | undefined, fallback: number): number {
  const n = value ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function level(value: string | undefined): LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error"
    ? value
    : DEFAULTS.logLevel;
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): BridgeConfig {
  return {
    petpoojaBaseUrl: (env.PETPOOJA_BASE_URL || DEFAULTS.petpoojaBaseUrl).replace(
      /\/$/,
      "",
    ),
    syncCode: env.PETPOOJA_SYNC_CODE ? env.PETPOOJA_SYNC_CODE : null,
    serverVersion: env.PETPOOJA_SERVER_VERSION ? env.PETPOOJA_SERVER_VERSION : null,
    port: num(env.BRIDGE_PORT, DEFAULTS.port),
    host: env.BRIDGE_HOST || DEFAULTS.host,
    authKeys: parseAuthKeys(env.BRIDGE_AUTH_KEYS),
    maxClockSkewMs: num(env.BRIDGE_MAX_CLOCK_SKEW_MS, DEFAULTS.maxClockSkewMs),
    petpoojaTimeoutMs: num(env.PETPOOJA_TIMEOUT_MS, DEFAULTS.petpoojaTimeoutMs),
    logLevel: level(env.BRIDGE_LOG_LEVEL),
  };
}

// The set of strings the logger must redact if they ever appear in a payload.
// Derived from config so the sync code and auth secrets are never logged.
export function secretsOf(config: BridgeConfig): string[] {
  const secrets: string[] = [];
  if (config.syncCode) secrets.push(config.syncCode);
  for (const key of config.authKeys) secrets.push(key.secret);
  return secrets;
}
