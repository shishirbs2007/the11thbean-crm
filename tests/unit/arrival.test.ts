import { describe, expect, it } from "vitest";

import {
  greetingLine,
  needsGettingToKnow,
  parseArrivalContext,
  type ArrivalContext,
} from "@/lib/intelligence/arrival";

function context(overrides: Partial<ArrivalContext> = {}): ArrivalContext {
  return {
    person_id: "p1",
    name: "Asha Menon",
    greeting_name: "Asha",
    allergies: [],
    dietary: [],
    usual_drink: "",
    usual_food: "",
    seating: "",
    total_visits: 0,
    days_since_visit: null,
    is_first_visit: true,
    staff_summary: "",
    communities: [],
    next_best_action: null,
    open_tasks: [],
    ...overrides,
  };
}

describe("parseArrivalContext", () => {
  it("reads a full payload", () => {
    const parsed = parseArrivalContext({
      person_id: "p1",
      name: "Asha Menon",
      greeting_name: "Asha",
      allergies: ["Peanuts"],
      usual_drink: "Flat White",
      total_visits: 10,
      is_first_visit: false,
      communities: ["Thursday Badminton"],
      open_tasks: [{ title: "Wish her happy birthday", detail: null }],
    });

    expect(parsed?.greeting_name).toBe("Asha");
    expect(parsed?.allergies).toEqual(["Peanuts"]);
    expect(parsed?.open_tasks).toHaveLength(1);
  });

  it("returns nothing without a person", () => {
    expect(parseArrivalContext(null)).toBeNull();
    expect(parseArrivalContext({ name: "Asha" })).toBeNull();
  });

  it("falls back to the full name when no greeting name is given", () => {
    const parsed = parseArrivalContext({ person_id: "p1", name: "Asha Menon" });
    expect(parsed?.greeting_name).toBe("Asha Menon");
  });

  it("drops non-string entries from arrays rather than rendering them", () => {
    const parsed = parseArrivalContext({
      person_id: "p1",
      allergies: ["Peanuts", 42, null],
      communities: "not an array",
    });

    expect(parsed?.allergies).toEqual(["Peanuts"]);
    expect(parsed?.communities).toEqual([]);
  });

  it("drops malformed tasks", () => {
    const parsed = parseArrivalContext({
      person_id: "p1",
      open_tasks: [{ detail: "no title" }, null, "text"],
    });

    expect(parsed?.open_tasks).toEqual([]);
  });

  it("keeps a null visit gap distinct from zero", () => {
    expect(parseArrivalContext({ person_id: "p1" })?.days_since_visit).toBeNull();
    expect(
      parseArrivalContext({ person_id: "p1", days_since_visit: 0 })?.days_since_visit,
    ).toBe(0);
  });
});

describe("greetingLine", () => {
  it("leads with an allergy above everything else", () => {
    const line = greetingLine(
      context({
        allergies: ["Peanuts"],
        usual_drink: "Flat White",
        is_first_visit: false,
      }),
    );

    expect(line).toBe("Asha — allergic to Peanuts");
  });

  it("says when somebody is new", () => {
    expect(greetingLine(context({ is_first_visit: true }))).toBe(
      "Asha — first time here",
    );
  });

  it("offers their usual once the café knows it", () => {
    expect(
      greetingLine(
        context({ is_first_visit: false, usual_drink: "Flat White" }),
      ),
    ).toBe("Asha — usually a Flat White");
  });

  it("admits when it does not know rather than guessing", () => {
    expect(
      greetingLine(context({ is_first_visit: false, total_visits: 4 })),
    ).toBe("Asha — 4 visits, usual not known yet");
  });
});

describe("needsGettingToKnow", () => {
  it("is true when the café knows nothing useful", () => {
    expect(needsGettingToKnow(context())).toBe(true);
  });

  it("is false once anything is known", () => {
    expect(needsGettingToKnow(context({ usual_drink: "Flat White" }))).toBe(false);
    expect(needsGettingToKnow(context({ allergies: ["Peanuts"] }))).toBe(false);
    expect(
      needsGettingToKnow(context({ staff_summary: "Thursday regular" })),
    ).toBe(false);
  });
});
