import { describe, expect, it } from "vitest";

import {
  groupTasksByUrgency,
  parseHospitalityScore,
  taskTypeLabel,
  topSignals,
  type HospitalityTask,
} from "@/lib/intelligence/briefing";

function task(overrides: Partial<HospitalityTask> = {}): HospitalityTask {
  return {
    id: crypto.randomUUID(),
    person_id: null,
    task_type: "staff_note",
    title: "Something to do",
    detail: null,
    priority: 3,
    status: "open",
    due_on: "2026-07-20",
    people: null,
    ...overrides,
  };
}

describe("taskTypeLabel", () => {
  it("phrases generated task types for staff", () => {
    expect(taskTypeLabel("service_recovery")).toBe("Needs putting right");
    expect(taskTypeLabel("welcome_back")).toBe("Still new here");
    expect(taskTypeLabel("reconnect")).toBe("Drifting away");
  });

  it("falls back readably for an unknown type", () => {
    expect(taskTypeLabel("some_new_type")).toBe("some new type");
  });
});

describe("groupTasksByUrgency", () => {
  it("treats top-priority work as needing attention now", () => {
    const { now, soon } = groupTasksByUrgency([
      task({ priority: 1, task_type: "milestone" }),
      task({ priority: 2, task_type: "reconnect" }),
    ]);

    expect(now).toHaveLength(1);
    expect(soon).toHaveLength(1);
  });

  it("always treats service recovery as urgent, whatever its priority", () => {
    const { now } = groupTasksByUrgency([
      task({ priority: 5, task_type: "service_recovery" }),
    ]);

    expect(now).toHaveLength(1);
  });

  it("keeps ordinary tasks out of the urgent list", () => {
    const { now, soon } = groupTasksByUrgency([
      task({ priority: 3 }),
      task({ priority: 4 }),
    ]);

    expect(now).toHaveLength(0);
    expect(soon).toHaveLength(2);
  });

  it("handles an empty day", () => {
    expect(groupTasksByUrgency([])).toEqual({ now: [], soon: [] });
  });
});

describe("parseHospitalityScore", () => {
  it("returns a zero score for a guest the café barely knows", () => {
    expect(parseHospitalityScore(null)).toEqual({ score: 0, signals: [] });
    expect(parseHospitalityScore({ score: 0, signals: [] }).score).toBe(0);
  });

  it("reads a full payload", () => {
    const parsed = parseHospitalityScore({
      score: 62.5,
      signals: [
        { key: "visit_recency", label: "Visit recency", strength: 80, weight: 1 },
      ],
    });

    expect(parsed.score).toBe(62.5);
    expect(parsed.signals[0].label).toBe("Visit recency");
  });

  it("drops malformed signals rather than throwing", () => {
    const parsed = parseHospitalityScore({
      score: 10,
      signals: [{ strength: 50 }, "nope", null],
    });

    expect(parsed.signals).toEqual([]);
  });

  it("falls back to the key when a label is missing", () => {
    const parsed = parseHospitalityScore({
      score: 5,
      signals: [{ key: "referral", strength: 20 }],
    });

    expect(parsed.signals[0].label).toBe("referral");
  });
});

describe("topSignals", () => {
  const score = parseHospitalityScore({
    score: 50,
    signals: [
      { key: "spend", label: "Spend", strength: 90, weight: 0.4 },
      { key: "recency", label: "Recency", strength: 80, weight: 1 },
      { key: "community", label: "Community", strength: 60, weight: 0.7 },
      { key: "referral", label: "Referral", strength: 10, weight: 0.7 },
    ],
  });

  it("ranks by weighted contribution, not raw strength", () => {
    expect(topSignals(score).map((signal) => signal.key)).toEqual([
      "recency",
      "community",
      "spend",
    ]);
  });

  it("honours the requested limit", () => {
    expect(topSignals(score, 2)).toHaveLength(2);
  });

  it("does not mutate the original signal order", () => {
    const before = score.signals.map((signal) => signal.key);
    topSignals(score);
    expect(score.signals.map((signal) => signal.key)).toEqual(before);
  });
});
