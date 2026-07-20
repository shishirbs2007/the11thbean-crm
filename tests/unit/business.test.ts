import { describe, expect, it } from "vitest";

import {
  attentionFirst,
  confidenceLabel,
  describeHour,
  forecastConfidence,
  formatMetric,
  peakAndQuiet,
  trendDirection,
  trendLabel,
  weekdayName,
  type Forecast,
  type Kpi,
} from "@/lib/intelligence/business";

function kpi(overrides: Partial<Kpi> = {}): Kpi {
  return {
    key: "revenue",
    label: "Revenue",
    unit: "currency",
    value: 1000,
    previous_value: 900,
    change_percent: 11.1,
    description: "Recorded takings.",
    explanation: "Up 11.1%.",
    recommended_action: "Takings are steady or growing.",
    needs_attention: false,
    drill_down_path: "/visits",
    ...overrides,
  };
}

function forecast(overrides: Partial<Forecast> = {}): Forecast {
  return {
    forecast_date: "2026-07-21",
    day_of_week: 1,
    expected_visits: 12,
    expected_guests: 18,
    expected_revenue: 4200,
    sample_weeks: 8,
    method: "Average of the last 8 same weekdays",
    ...overrides,
  };
}

describe("formatMetric", () => {
  it("writes money the way the café reads it", () => {
    expect(formatMetric(42350.6, "currency")).toBe("₹42,351");
  });

  it("keeps percentages whole", () => {
    expect(formatMetric(67.4, "percent")).toBe("67%");
  });

  it("formats plain counts", () => {
    expect(formatMetric(1234, "number")).toBe("1,234");
  });

  it("shows a dash rather than NaN", () => {
    expect(formatMetric(Number.NaN, "number")).toBe("—");
    expect(formatMetric(Number.POSITIVE_INFINITY, "currency")).toBe("—");
  });
});

describe("trendDirection", () => {
  it("ignores noise around zero", () => {
    expect(trendDirection(0.4)).toBe("flat");
    expect(trendDirection(-0.9)).toBe("flat");
  });

  it("reports real movement", () => {
    expect(trendDirection(12)).toBe("up");
    expect(trendDirection(-12)).toBe("down");
  });

  it("admits when there is nothing to compare", () => {
    expect(trendDirection(null)).toBe("unknown");
  });
});

describe("trendLabel", () => {
  it("shows the size of the move, not just its direction", () => {
    expect(trendLabel(kpi({ change_percent: 11.1 }))).toBe("▲ 11.1%");
    expect(trendLabel(kpi({ change_percent: -8 }))).toBe("▼ 8%");
  });

  it("says plainly when there is no comparison", () => {
    expect(trendLabel(kpi({ change_percent: null }))).toBe(
      "No comparison yet",
    );
  });
});

describe("attentionFirst", () => {
  it("puts metrics needing attention above healthy ones", () => {
    const sorted = attentionFirst([
      kpi({ key: "healthy", needs_attention: false }),
      kpi({ key: "worrying", needs_attention: true }),
    ]);

    expect(sorted[0].key).toBe("worrying");
  });

  it("ranks the sharpest decline first among equals", () => {
    const sorted = attentionFirst([
      kpi({ key: "mild", needs_attention: true, change_percent: -5 }),
      kpi({ key: "severe", needs_attention: true, change_percent: -40 }),
    ]);

    expect(sorted[0].key).toBe("severe");
  });

  it("does not mutate the original list", () => {
    const original = [kpi({ key: "a" }), kpi({ key: "b", needs_attention: true })];
    attentionFirst(original);
    expect(original[0].key).toBe("a");
  });
});

describe("forecastConfidence", () => {
  it("refuses to dress up a guess", () => {
    expect(forecastConfidence(forecast({ sample_weeks: 0 }))).toBe("none");
    expect(forecastConfidence(forecast({ sample_weeks: 2 }))).toBe("low");
  });

  it("grows more confident with more comparable weeks", () => {
    expect(forecastConfidence(forecast({ sample_weeks: 4 }))).toBe("fair");
    expect(forecastConfidence(forecast({ sample_weeks: 10 }))).toBe("good");
  });

  it("labels confidence in plain words", () => {
    expect(confidenceLabel(forecast({ sample_weeks: 0 }))).toBe(
      "No history yet",
    );
    expect(confidenceLabel(forecast({ sample_weeks: 10 }))).toBe(
      "Well supported",
    );
  });
});

describe("peakAndQuiet", () => {
  it("finds the busiest and quietest trading hours", () => {
    const { peak, quiet } = peakAndQuiet([
      { day_of_week: 1, hour_of_day: 8, visit_count: 3 },
      { day_of_week: 1, hour_of_day: 17, visit_count: 22 },
      { day_of_week: 2, hour_of_day: 15, visit_count: 9 },
    ]);

    expect(peak?.hour_of_day).toBe(17);
    expect(quiet?.hour_of_day).toBe(8);
  });

  it("treats hours with no visits as unknown, not quiet", () => {
    const { quiet } = peakAndQuiet([
      { day_of_week: 1, hour_of_day: 4, visit_count: 0 },
      { day_of_week: 1, hour_of_day: 9, visit_count: 5 },
    ]);

    expect(quiet?.hour_of_day).toBe(9);
  });

  it("reports nothing when the café has no recorded visits", () => {
    expect(peakAndQuiet([])).toEqual({ peak: null, quiet: null });
  });
});

describe("describeHour", () => {
  it("reads clock time the way people say it", () => {
    expect(describeHour(0)).toBe("12am");
    expect(describeHour(9)).toBe("9am");
    expect(describeHour(12)).toBe("12pm");
    expect(describeHour(17)).toBe("5pm");
  });
});

describe("weekdayName", () => {
  it("names the days", () => {
    expect(weekdayName(0)).toBe("Sunday");
    expect(weekdayName(4)).toBe("Thursday");
  });

  it("does not throw on an unexpected value", () => {
    expect(weekdayName(9)).toBe("Unknown");
  });
});
