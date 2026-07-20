import { describe, expect, it } from "vitest";

import {
  describeAudience,
  lifecycleProgress,
  missingRationale,
  nextCampaignStep,
  parseAudienceExplanation,
  parseAudienceRules,
  type CampaignRationale,
} from "@/lib/intelligence/audiences";

describe("parseAudienceExplanation", () => {
  it("reads a full breakdown", () => {
    const parsed = parseAudienceExplanation({
      total: 237,
      reasons: [
        { key: "event_attendee", label: "Attended Book Club", count: 81 },
        { key: "regular_not_seen", label: "Not seen in 30 days", count: 65 },
      ],
    });

    expect(parsed.total).toBe(237);
    expect(parsed.reasons).toHaveLength(2);
  });

  it("treats a missing payload as an empty audience", () => {
    expect(parseAudienceExplanation(null)).toEqual({ total: 0, reasons: [] });
    expect(parseAudienceExplanation("nope").total).toBe(0);
  });

  it("drops malformed reasons rather than throwing on a send screen", () => {
    const parsed = parseAudienceExplanation({
      total: 3,
      reasons: [{ count: 2 }, null, "text"],
    });

    expect(parsed.reasons).toEqual([]);
  });
});

describe("parseAudienceRules", () => {
  it("keeps the parameters a rule was given", () => {
    const rules = parseAudienceRules([
      { key: "regular_not_seen", days: 45 },
      { key: "community_member", reference_id: "abc" },
      { key: "favourite_item", reference_text: "pour-over" },
    ]);

    expect(rules[0]).toEqual({ key: "regular_not_seen", days: 45 });
    expect(rules[1].reference_id).toBe("abc");
    expect(rules[2].reference_text).toBe("pour-over");
  });

  it("ignores entries without a rule key", () => {
    expect(parseAudienceRules([{ days: 30 }, null, "nope", {}])).toEqual([]);
  });

  it("ignores a non-positive day window", () => {
    expect(parseAudienceRules([{ key: "regular_not_seen", days: 0 }])).toEqual([
      { key: "regular_not_seen" },
    ]);
  });

  it("returns nothing for a non-array", () => {
    expect(parseAudienceRules("rules")).toEqual([]);
  });
});

describe("describeAudience", () => {
  it("explains itself in the words staff would use", () => {
    const description = describeAudience({
      total: 237,
      reasons: [
        { key: "a", label: "Attended Book Club", count: 81 },
        { key: "b", label: "Not seen in 30 days", count: 65 },
      ],
    });

    expect(description).toBe(
      "237 guests · 81 attended book club, 65 not seen in 30 days",
    );
  });

  it("says plainly when nobody matches", () => {
    expect(describeAudience({ total: 0, reasons: [] })).toBe(
      "Nobody matches yet",
    );
  });

  it("uses the singular for one guest", () => {
    expect(describeAudience({ total: 1, reasons: [] })).toBe("1 guest");
  });

  it("caps how many reasons it lists", () => {
    const reasons = Array.from({ length: 8 }, (_, index) => ({
      key: `r${index}`,
      label: `Reason ${index}`,
      count: 10 - index,
    }));

    const description = describeAudience({ total: 40, reasons }, 3);

    expect(description.split(",")).toHaveLength(3);
  });
});

describe("nextCampaignStep", () => {
  it("walks the lifecycle one step at a time", () => {
    expect(nextCampaignStep("draft")?.status).toBe("review");
    expect(nextCampaignStep("review")?.status).toBe("approved");
    expect(nextCampaignStep("approved")?.status).toBe("scheduled");
    expect(nextCampaignStep("scheduled")?.status).toBe("running");
    expect(nextCampaignStep("running")?.status).toBe("completed");
  });

  it("offers nothing beyond the end, or after cancellation", () => {
    expect(nextCampaignStep("completed")).toBeNull();
    expect(nextCampaignStep("cancelled")).toBeNull();
    expect(nextCampaignStep("paused")).toBeNull();
  });

  it("labels each step for a person, not a state machine", () => {
    expect(nextCampaignStep("draft")?.label).toBe("Send for review");
    expect(nextCampaignStep("review")?.label).toBe("Approve");
  });
});

describe("lifecycleProgress", () => {
  it("runs from nothing to complete", () => {
    expect(lifecycleProgress("draft")).toBe(0);
    expect(lifecycleProgress("completed")).toBe(100);
  });

  it("advances through the middle", () => {
    expect(lifecycleProgress("approved")).toBeGreaterThan(
      lifecycleProgress("review"),
    );
  });

  it("reports nothing for a cancelled campaign", () => {
    expect(lifecycleProgress("cancelled")).toBe(0);
  });
});

describe("missingRationale", () => {
  function campaign(
    overrides: Partial<CampaignRationale> = {},
  ): CampaignRationale {
    return {
      audience_id: "aud",
      rationale_why_them: "They come every Thursday for badminton.",
      rationale_why_now: "The new season starts next week.",
      rationale_why_message: "It is the only way they will hear about it.",
      hoped_outcome: "Twelve of them sign up.",
      ...overrides,
    };
  }

  it("is satisfied by a fully reasoned campaign", () => {
    expect(missingRationale(campaign())).toEqual([]);
  });

  it("insists on an audience", () => {
    expect(missingRationale(campaign({ audience_id: null }))).toContain(
      "Choose an audience",
    );
  });

  it("asks every question the café should have answered", () => {
    const missing = missingRationale({
      audience_id: null,
      rationale_why_them: null,
      rationale_why_now: null,
      rationale_why_message: null,
      hoped_outcome: null,
    });

    expect(missing).toHaveLength(5);
  });

  it("does not accept whitespace as an answer", () => {
    expect(missingRationale(campaign({ hoped_outcome: "   " }))).toContain(
      "What outcome do we hope for?",
    );
  });
});
