import { beforeEach, describe, expect, it } from "vitest";

import {
  environmentSatisfied,
  hasCapability,
  missingEnvironment,
  type IntegrationAdapter,
} from "@/lib/integrations/types";
import {
  getAdapter,
  registerAdapter,
  resolveCapability,
  sendVia,
} from "@/lib/integrations/registry";

function adapter(overrides: Partial<IntegrationAdapter> = {}): IntegrationAdapter {
  return {
    key: "test-email",
    label: "Test email",
    capabilities: ["email.send"],
    requiredEnv: ["TEST_EMAIL_KEY"],
    isConfigured: () => true,
    async send() {
      return { ok: true, providerMessageId: "msg-1" };
    },
    ...overrides,
  };
}

describe("environmentSatisfied", () => {
  it("is satisfied when every variable is present", () => {
    expect(environmentSatisfied(["A", "B"], { A: "1", B: "2" })).toBe(true);
  });

  it("treats an empty or whitespace value as missing", () => {
    expect(environmentSatisfied(["A"], { A: "" })).toBe(false);
    expect(environmentSatisfied(["A"], { A: "   " })).toBe(false);
  });

  it("names exactly what is missing", () => {
    expect(missingEnvironment(["A", "B", "C"], { A: "1", C: "3" })).toEqual([
      "B",
    ]);
  });

  it("needs nothing when nothing is required", () => {
    expect(environmentSatisfied([], {})).toBe(true);
  });
});

describe("hasCapability", () => {
  it("reports what an adapter declares", () => {
    expect(hasCapability(adapter(), "email.send")).toBe(true);
    expect(hasCapability(adapter(), "sms.send")).toBe(false);
  });
});

describe("registry", () => {
  beforeEach(() => {
    registerAdapter(adapter());
  });

  it("finds a registered adapter by key", () => {
    expect(getAdapter("test-email")?.label).toBe("Test email");
    expect(getAdapter("nothing-here")).toBeNull();
  });

  it("resolves a capability to a configured adapter", () => {
    expect(resolveCapability("email.send")?.key).toBe("test-email");
  });

  it("refuses an adapter that is registered but not configured", () => {
    registerAdapter(
      adapter({ key: "test-sms", capabilities: ["sms.send"], isConfigured: () => false }),
    );

    expect(resolveCapability("sms.send")).toBeNull();
  });

  it("returns null for a capability nobody provides", () => {
    expect(resolveCapability("calendar.sync")).toBeNull();
  });
});

describe("sendVia", () => {
  it("sends through the adapter that carries the capability", async () => {
    registerAdapter(adapter());

    const result = await sendVia("email.send", {
      to: "guest@example.com",
      body: "Your table is ready.",
    });

    expect(result).toEqual({ ok: true, providerMessageId: "msg-1" });
  });

  it("refuses rather than pretending when nothing is configured", async () => {
    const result = await sendVia("push.send", {
      to: "device",
      body: "Hello",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No messaging provider is configured");
      expect(result.retryable).toBe(false);
    }
  });

  it("turns a thrown provider error into a retryable failure", async () => {
    registerAdapter(
      adapter({
        key: "test-whatsapp",
        capabilities: ["whatsapp.send"],
        async send() {
          throw new Error("provider timeout");
        },
      }),
    );

    const result = await sendVia("whatsapp.send", {
      to: "+910000000000",
      body: "Hello",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("provider timeout");
      expect(result.retryable).toBe(true);
    }
  });
});
