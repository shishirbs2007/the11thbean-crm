import { describe, expect, it } from "vitest";

import {
  attendanceRate,
  capacityLabel,
  capacityState,
  communityStatus,
  placesRemaining,
  postEventActions,
  type AttendanceSummary,
} from "@/lib/intelligence/events";

function summary(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
  return {
    registered_count: 0,
    expected_headcount: 0,
    attended_count: 0,
    no_show_count: 0,
    interested_count: 0,
    capacity_used_percent: null,
    ...overrides,
  };
}

describe("capacityState", () => {
  it("treats an uncapped event as open", () => {
    expect(capacityState(500, null)).toBe("open");
    expect(capacityState(500, 0)).toBe("open");
  });

  it("warns before the room is actually full", () => {
    expect(capacityState(39, 50)).toBe("filling");
    expect(capacityState(40, 50)).toBe("nearly_full");
  });

  it("separates exactly full from over-subscribed", () => {
    expect(capacityState(50, 50)).toBe("full");
    expect(capacityState(51, 50)).toBe("over");
  });

  it("reports a quiet event as having room", () => {
    expect(capacityState(4, 50)).toBe("open");
  });

  it("labels every state in plain language", () => {
    expect(capacityLabel(capacityState(51, 50))).toBe("Over capacity");
    expect(capacityLabel(capacityState(50, 50))).toBe("Full");
    expect(capacityLabel(capacityState(45, 50))).toBe("Nearly full");
    expect(capacityLabel(capacityState(30, 50))).toBe("Filling up");
    expect(capacityLabel(capacityState(1, 50))).toBe("Room to spare");
  });
});

describe("placesRemaining", () => {
  it("counts down from the cap", () => {
    expect(placesRemaining(18, 50)).toBe(32);
  });

  it("never goes negative when over-subscribed", () => {
    expect(placesRemaining(60, 50)).toBe(0);
  });

  it("returns null for an uncapped event", () => {
    expect(placesRemaining(60, null)).toBeNull();
  });
});

describe("attendanceRate", () => {
  it("is unknown until the event has been marked off", () => {
    expect(attendanceRate(summary({ registered_count: 10 }))).toBeNull();
  });

  it("measures turnout against those who were decided", () => {
    expect(
      attendanceRate(summary({ attended_count: 8, no_show_count: 2 })),
    ).toBe(80);
  });

  it("reports a full turnout", () => {
    expect(attendanceRate(summary({ attended_count: 5 }))).toBe(100);
  });
});

describe("postEventActions", () => {
  const people = [
    { personId: "1", name: "Asha", status: "attended" },
    { personId: "2", name: "Ravi", status: "no_show" },
    { personId: "3", name: "Meera", status: "interested" },
    { personId: "4", name: "Sam", status: "cancelled" },
  ];

  it("thanks the people who came", () => {
    const actions = postEventActions(people);
    expect(actions.find((a) => a.personId === "1")?.action).toContain("Thank Asha");
  });

  it("checks on a no-show without chasing them", () => {
    const action = postEventActions(people).find((a) => a.personId === "2");
    expect(action?.action).toContain("do not chase");
  });

  it("asks what would have made it easier for the merely interested", () => {
    const action = postEventActions(people).find((a) => a.personId === "3");
    expect(action?.action).toContain("what would have made it easier");
  });

  it("says nothing about someone who cancelled", () => {
    expect(postEventActions(people).some((a) => a.personId === "4")).toBe(false);
  });
});

describe("communityStatus", () => {
  const base = {
    active_members: 12,
    joined_last_quarter: 0,
    events_last_quarter: 3,
    last_event_at: "2026-07-01T10:00:00.000Z",
    next_event_at: "2026-08-01T10:00:00.000Z",
  };

  it("flags an empty community", () => {
    expect(communityStatus({ ...base, active_members: 0 })).toEqual({
      label: "No active members",
      needsAttention: true,
    });
  });

  it("distinguishes a lapsed community from one that never met", () => {
    expect(
      communityStatus({ ...base, events_last_quarter: 0 }).label,
    ).toBe("No events this quarter");

    expect(
      communityStatus({
        ...base,
        events_last_quarter: 0,
        last_event_at: null,
      }).label,
    ).toBe("Never met yet");
  });

  it("flags a community with nothing in the diary", () => {
    expect(communityStatus({ ...base, next_event_at: null })).toEqual({
      label: "Nothing planned next",
      needsAttention: true,
    });
  });

  it("celebrates growth", () => {
    const status = communityStatus({ ...base, joined_last_quarter: 4 });
    expect(status.label).toBe("Growing, 4 joined recently");
    expect(status.needsAttention).toBe(false);
  });

  it("is content with a steady community", () => {
    expect(communityStatus(base)).toEqual({
      label: "Meeting regularly",
      needsAttention: false,
    });
  });
});
