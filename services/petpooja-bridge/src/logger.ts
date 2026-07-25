import type { LogLevel } from "./config.ts";

// Structured JSON logging with aggressive secret redaction. Two layers:
//  1. key-based — any field whose name looks sensitive is masked
//  2. value-based — any occurrence of a known secret string is masked
// so a secret cannot leak even if it turns up in an unexpected place.

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY = /(secret|sync[_-]?code|authorization|signature|token|password|api[_-]?key|service[_-]?role|cookie)/i;

export const REDACTED = "[REDACTED]";

export function redact(value: unknown, secrets: string[] = [], seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    let out = value;
    for (const secret of secrets) {
      if (secret && out.includes(secret)) out = out.split(secret).join(REDACTED);
    }
    return out;
  }
  if (Array.isArray(value)) {
    return value.map((v) => redact(v, secrets, seen));
  }
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEY.test(k) ? REDACTED : redact(v, secrets, seen);
    }
    return out;
  }
  return value;
}

export type Logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
};

export function createLogger(options: {
  level: LogLevel;
  secrets?: string[];
  write?: (line: string) => void;
}): Logger {
  const threshold = LEVEL_RANK[options.level];
  const secrets = options.secrets ?? [];
  const write = options.write ?? ((line: string) => process.stdout.write(line + "\n"));

  const emit = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_RANK[level] < threshold) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      msg,
      ...(fields ? (redact(fields, secrets) as Record<string, unknown>) : {}),
    };
    write(JSON.stringify(record));
  };

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
  };
}
