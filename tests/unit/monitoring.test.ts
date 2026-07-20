import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearIncidentSinks,
  configuredSinks,
  describeError,
  overallStatus,
  recordIncident,
  registerIncidentSink,
  statusWording,
  troubleFirst,
  withIncidentReporting,
  type HealthCheck,
  type Incident,
} from "@/lib/monitoring/incidents";

function check(overrides: Partial<HealthCheck> = {}): HealthCheck {
  return {
    check_key: "data_flowing",
    label: "Records reaching the CRM",
    status: "ok",
    detail: "Last visit recorded 0 days ago.",
    recommended_action: "Nothing to do.",
    drill_down_path: "/integrations",
    ...overrides,
  };
}

function fakeSupabase(behaviour: "ok" | "throws" = "ok") {
  return {
    rpc: vi.fn(async () => {
      if (behaviour === "throws") throw new Error("database unreachable");
      return { data: null, error: null };
    }),
  } as never;
}

afterEach(() => {
  clearIncidentSinks();
  vi.restoreAllMocks();
});

describe("describeError", () => {
  it("reads a thrown Error", () => {
    const described = describeError(new Error("visit insert failed"));
    expect(described.summary).toBe("visit insert failed");
    expect(described.detail).toContain("visit insert failed");
  });

  it("falls back to the name when a message is empty", () => {
    expect(describeError(new Error("")).summary).toBe("Error");
  });

  it("reads a thrown string", () => {
    expect(describeError("something broke").summary).toBe("something broke");
  });

  it("survives a thrown object", () => {
    const described = describeError({ code: 500 });
    expect(described.summary).toBe("Non-error thrown");
    expect(described.detail).toContain("500");
  });

  it("survives something that cannot be serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular).summary).toBe("Non-error thrown");
  });
});

describe("recordIncident", () => {
  const incident: Incident = {
    area: "import",
    summary: "Could not parse the till export",
  };

  it("writes through to the database", async () => {
    const supabase = fakeSupabase();
    await recordIncident(supabase, incident);

    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc)
      .toHaveBeenCalledWith(
        "record_incident",
        expect.objectContaining({
          incident_area: "import",
          incident_severity: "error",
        }),
      );
  });

  it("never throws when the database is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Monitoring that fails loudly turns a small problem into a broken page.
    await expect(
      recordIncident(fakeSupabase("throws"), incident),
    ).resolves.toBeUndefined();
  });

  it("delivers to a configured sink", async () => {
    const deliver = vi.fn(async () => {});
    registerIncidentSink({ name: "test", isConfigured: () => true, deliver });

    await recordIncident(fakeSupabase(), incident);

    expect(deliver).toHaveBeenCalledWith(incident);
  });

  it("skips a sink that is not configured", async () => {
    const deliver = vi.fn(async () => {});
    registerIncidentSink({ name: "test", isConfigured: () => false, deliver });

    await recordIncident(fakeSupabase(), incident);

    expect(deliver).not.toHaveBeenCalled();
  });

  it("keeps going when one sink fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const second = vi.fn(async () => {});

    registerIncidentSink({
      name: "broken",
      isConfigured: () => true,
      deliver: async () => {
        throw new Error("network down");
      },
    });
    registerIncidentSink({ name: "working", isConfigured: () => true, deliver: second });

    await recordIncident(fakeSupabase(), incident);

    expect(second).toHaveBeenCalled();
  });

  it("reports which sinks are actually usable", () => {
    registerIncidentSink({ name: "on", isConfigured: () => true, deliver: async () => {} });
    registerIncidentSink({ name: "off", isConfigured: () => false, deliver: async () => {} });

    expect(configuredSinks()).toEqual(["on"]);
  });
});

describe("withIncidentReporting", () => {
  it("returns the result when nothing goes wrong", async () => {
    const result = await withIncidentReporting(fakeSupabase(), "briefing", async () => 42);
    expect(result).toBe(42);
  });

  it("records the failure and rethrows it", async () => {
    const supabase = fakeSupabase();

    await expect(
      withIncidentReporting(supabase, "briefing", async () => {
        throw new Error("task generation failed");
      }),
    ).rejects.toThrow("task generation failed");

    // Rethrown, because swallowing would leave the caller believing it worked.
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc)
      .toHaveBeenCalled();
  });
});

describe("overallStatus", () => {
  it("reports the worst status present", () => {
    expect(overallStatus([check(), check({ status: "warning" })])).toBe("warning");
    expect(
      overallStatus([check(), check({ status: "warning" }), check({ status: "error" })]),
    ).toBe("error");
  });

  it("is ok when everything is ok", () => {
    expect(overallStatus([check(), check()])).toBe("ok");
  });

  it("is ok when there is nothing to report", () => {
    expect(overallStatus([])).toBe("ok");
  });

  it("words each status for a person", () => {
    expect(statusWording("error")).toBe("Something needs attention");
    expect(statusWording("warning")).toBe("Worth a look");
    expect(statusWording("ok")).toBe("Everything is working");
  });
});

describe("troubleFirst", () => {
  it("puts errors above warnings above healthy checks", () => {
    const sorted = troubleFirst([
      check({ check_key: "a", status: "ok" }),
      check({ check_key: "b", status: "error" }),
      check({ check_key: "c", status: "warning" }),
    ]);

    expect(sorted.map((entry) => entry.check_key)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the original list", () => {
    const original = [
      check({ check_key: "a", status: "ok" }),
      check({ check_key: "b", status: "error" }),
    ];

    troubleFirst(original);

    expect(original[0].check_key).toBe("a");
  });
});
