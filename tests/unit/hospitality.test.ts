import { describe, expect, it } from "vitest";

import {
  buildHospitalitySuggestions,
  parseTasteProfile,
  upcomingImportantDates,
  usualDrink,
  usualFood,
  type HospitalitySignals,
} from "@/lib/intelligence/hospitality";

function signals(
  overrides: Partial<HospitalitySignals> = {},
): HospitalitySignals {
  return {
    taste: { drink: [], food: [], other: [] },
    statedDrink: "",
    allergies: [],
    seatingPreference: "",
    daysSinceLastVisit: null,
    referralCount: 0,
    communityNames: [],
    upcomingDates: [],
    ...overrides,
  };
}

function item(name: string, visits: number) {
  return {
    item_name: name,
    category: null,
    visit_count: visits,
    total_quantity: visits,
    last_ordered_at: "2026-07-01T09:00:00.000Z",
  };
}

describe("parseTasteProfile", () => {
  it("returns empty groups for missing or malformed payloads", () => {
    expect(parseTasteProfile(null)).toEqual({
      drink: [],
      food: [],
      other: [],
    });
    expect(parseTasteProfile("not an object").drink).toEqual([]);
    expect(parseTasteProfile({ drink: "nope" }).drink).toEqual([]);
  });

  it("keeps well-formed entries and drops nameless ones", () => {
    const profile = parseTasteProfile({
      drink: [
        {
          item_name: "Flat White",
          category: "coffee",
          visit_count: 6,
          total_quantity: 7,
          last_ordered_at: "2026-07-18T10:00:00.000Z",
        },
        { visit_count: 3 },
      ],
    });

    expect(profile.drink).toHaveLength(1);
    expect(profile.drink[0].item_name).toBe("Flat White");
    expect(profile.drink[0].category).toBe("coffee");
  });

  it("coerces numeric fields that arrive as strings", () => {
    const profile = parseTasteProfile({
      food: [{ item_name: "Banana Bread", visit_count: "4", total_quantity: "5" }],
    });

    expect(profile.food[0].visit_count).toBe(4);
    expect(profile.food[0].total_quantity).toBe(5);
  });
});

describe("usualDrink", () => {
  it("prefers a repeatedly ordered drink over a staff note", () => {
    expect(
      usualDrink(
        signals({
          statedDrink: "Cappuccino",
          taste: { drink: [item("Flat White", 6)], food: [], other: [] },
        }),
      ),
    ).toBe("Flat White");
  });

  it("falls back to the staff note when the order history is thin", () => {
    expect(
      usualDrink(
        signals({
          statedDrink: "Cappuccino",
          taste: { drink: [item("Flat White", 1)], food: [], other: [] },
        }),
      ),
    ).toBe("Cappuccino");
  });

  it("uses a single recorded order when nothing else is known", () => {
    expect(
      usualDrink(
        signals({
          taste: { drink: [item("Cortado", 1)], food: [], other: [] },
        }),
      ),
    ).toBe("Cortado");
  });

  it("returns nothing when the café has no signal at all", () => {
    expect(usualDrink(signals())).toBe("");
  });
});

describe("usualFood", () => {
  it("only reports food ordered on more than one visit", () => {
    expect(
      usualFood(
        signals({ taste: { drink: [], food: [item("Croissant", 3)], other: [] } }),
      ),
    ).toBe("Croissant");

    expect(
      usualFood(
        signals({ taste: { drink: [], food: [item("Croissant", 1)], other: [] } }),
      ),
    ).toBe("");
  });
});

describe("upcomingImportantDates", () => {
  const today = new Date("2026-07-20T08:00:00.000Z");

  it("rolls an annual date recorded years ago forward to this year", () => {
    const result = upcomingImportantDates(
      [
        {
          date_type: "birthday",
          date_value: "1988-07-25",
          label: null,
          recurring_annually: true,
        },
      ],
      today,
    );

    expect(result).toEqual([{ label: "birthday", daysAway: 5 }]);
  });

  it("rolls past this year's occurrence into next year, out of the window", () => {
    expect(
      upcomingImportantDates(
        [
          {
            date_type: "birthday",
            date_value: "1988-07-19",
            label: null,
            recurring_annually: true,
          },
        ],
        today,
      ),
    ).toEqual([]);
  });

  it("reports the day itself as zero days away", () => {
    const result = upcomingImportantDates(
      [
        {
          date_type: "anniversary",
          date_value: "2020-07-20",
          label: "wedding anniversary",
          recurring_annually: true,
        },
      ],
      today,
    );

    expect(result).toEqual([{ label: "wedding anniversary", daysAway: 0 }]);
  });

  it("ignores one-off dates that have already passed", () => {
    expect(
      upcomingImportantDates(
        [
          {
            date_type: "graduation",
            date_value: "2026-07-10",
            label: null,
            recurring_annually: false,
          },
        ],
        today,
      ),
    ).toEqual([]);
  });

  it("drops dates beyond the fortnight window and sorts the rest", () => {
    const result = upcomingImportantDates(
      [
        {
          date_type: "birthday",
          date_value: "1990-08-30",
          label: null,
          recurring_annually: true,
        },
        {
          date_type: "anniversary",
          date_value: "2010-07-30",
          label: null,
          recurring_annually: true,
        },
        {
          date_type: "milestone",
          date_value: "2015-07-22",
          label: null,
          recurring_annually: true,
        },
      ],
      today,
    );

    expect(result.map((entry) => entry.label)).toEqual([
      "milestone",
      "anniversary",
    ]);
  });

  it("skips unparseable dates rather than throwing", () => {
    expect(
      upcomingImportantDates(
        [
          {
            date_type: "birthday",
            date_value: "not-a-date",
            label: null,
            recurring_annually: true,
          },
        ],
        today,
      ),
    ).toEqual([]);
  });
});

describe("buildHospitalitySuggestions", () => {
  it("puts allergens first, ahead of everything else", () => {
    const result = buildHospitalitySuggestions(
      signals({
        allergies: ["Peanuts"],
        statedDrink: "Flat White",
        referralCount: 2,
      }),
    );

    expect(result[0]).toContain("Peanuts");
  });

  it("prompts staff to capture a preference when none is known", () => {
    expect(buildHospitalitySuggestions(signals())).toContain(
      "Ask what coffee style they usually enjoy, and record it.",
    );
  });

  it("flags a lapsed guest with the exact gap", () => {
    const result = buildHospitalitySuggestions(
      signals({ daysSinceLastVisit: 60 }),
    );

    expect(result.join(" ")).toContain("60 days ago");
  });

  it("stays quiet about a recent guest", () => {
    const result = buildHospitalitySuggestions(
      signals({ daysSinceLastVisit: 3 }),
    );

    expect(result.join(" ")).not.toContain("Reconnect personally");
  });

  it("words a milestone differently on the day itself", () => {
    const today = buildHospitalitySuggestions(
      signals({ upcomingDates: [{ label: "birthday", daysAway: 0 }] }),
    );
    const soon = buildHospitalitySuggestions(
      signals({ upcomingDates: [{ label: "birthday", daysAway: 1 }] }),
    );

    expect(today.join(" ")).toContain("Today is their birthday");
    expect(soon.join(" ")).toContain("in 1 day.");
  });

  it("pluralises referrals correctly", () => {
    expect(
      buildHospitalitySuggestions(signals({ referralCount: 1 })).join(" "),
    ).toContain("1 customer.");
    expect(
      buildHospitalitySuggestions(signals({ referralCount: 3 })).join(" "),
    ).toContain("3 customers.");
  });

  it("honours the requested limit", () => {
    const result = buildHospitalitySuggestions(
      signals({
        allergies: ["Peanuts"],
        statedDrink: "Flat White",
        seatingPreference: "at the quiet corner table",
        daysSinceLastVisit: 90,
        referralCount: 4,
        communityNames: ["Badminton Club"],
      }),
      3,
    );

    expect(result).toHaveLength(3);
  });
});
