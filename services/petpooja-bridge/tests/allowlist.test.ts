import { describe, expect, it } from "vitest";
import {
  isOperation,
  OPERATIONS,
  READ_OPERATIONS,
  validateParams,
  WRITE_OPERATIONS,
} from "../src/allowlist.ts";
import { BridgeError } from "../src/errors.ts";

describe("operation allowlist", () => {
  it("recognises only known operations", () => {
    for (const op of OPERATIONS) expect(isOperation(op)).toBe(true);
    expect(isOperation("delete_everything")).toBe(false);
    expect(isOperation("../etc/passwd")).toBe(false);
    expect(isOperation(42)).toBe(false);
  });

  it("classifies reads and writes with no overlap", () => {
    for (const op of READ_OPERATIONS) expect(WRITE_OPERATIONS.has(op)).toBe(false);
    expect(WRITE_OPERATIONS.has("order.create")).toBe(true);
    expect(WRITE_OPERATIONS.has("customer.create")).toBe(true);
  });
});

describe("validateParams", () => {
  it("accepts a valid customer.find", () => {
    expect(validateParams("customer.find", { phone: "555" })).toMatchObject({ phone: "555" });
  });

  it("rejects a customer.find with no identifier", () => {
    expect(() => validateParams("customer.find", {})).toThrowError(BridgeError);
  });

  it("requires an idempotency key on order.create", () => {
    expect(() =>
      validateParams("order.create", { lines: [{ itemId: "x", quantity: 1 }] }),
    ).toThrowError(/Invalid params/i);
    const ok = validateParams("order.create", {
      clientOrderId: "abc-123",
      lines: [{ itemId: "x", quantity: 2 }],
    });
    expect(ok).toMatchObject({ clientOrderId: "abc-123" });
  });

  it("requires an externalId on order.get", () => {
    expect(() => validateParams("order.get", {})).toThrowError(BridgeError);
    expect(validateParams("order.get", { externalId: "BILL-1" })).toMatchObject({
      externalId: "BILL-1",
    });
  });

  it("defaults empty params for status", () => {
    expect(validateParams("status", undefined)).toEqual({});
  });
});
