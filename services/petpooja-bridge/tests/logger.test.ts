import { describe, expect, it } from "vitest";
import { createLogger, redact, REDACTED } from "../src/logger.ts";

describe("redact", () => {
  it("masks sensitive keys by name", () => {
    const out = redact({ sync_code: "SECRET123", nested: { authorization: "Bearer x" } });
    expect(out).toEqual({ sync_code: REDACTED, nested: { authorization: REDACTED } });
  });

  it("masks known secret values wherever they appear", () => {
    const out = redact({ note: "the code is SECRET123 today" }, ["SECRET123"]);
    expect(out).toEqual({ note: `the code is ${REDACTED} today` });
  });

  it("handles circular structures without throwing", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    expect(() => redact(obj)).not.toThrow();
  });
});

describe("createLogger", () => {
  it("emits JSON and never leaks a configured secret", () => {
    const lines: string[] = [];
    const logger = createLogger({
      level: "info",
      secrets: ["hunter2"],
      write: (line) => lines.push(line),
    });
    logger.info("login", { password: "hunter2", detail: "token hunter2 used", x_bridge_signature: "abc" });
    logger.debug("below threshold", {});

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]!);
    expect(record.msg).toBe("login");
    expect(record.password).toBe(REDACTED); // key-based
    expect(record.detail).toBe(`token ${REDACTED} used`); // value-based
    expect(lines[0]).not.toContain("hunter2");
  });
});
