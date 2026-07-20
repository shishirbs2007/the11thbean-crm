/**
 * Business intelligence presentation.
 *
 * Every number the dashboard shows is computed in SQL, from the same tables
 * the rest of the CRM reads. Nothing here recalculates a metric; it decides
 * how a metric is worded and how urgently it is shown.
 */

export type Kpi = {
  key: string;
  label: string;
  unit: "number" | "currency" | "percent";
  value: number;
  previous_value: number | null;
  change_percent: number | null;
  description: string;
  explanation: string;
  recommended_action: string;
  needs_attention: boolean;
  drill_down_path: string;
};

/**
 * Formats a value the way a café owner reads it: rupees without decimals,
 * percentages whole, counts plain.
 */
export function formatMetric(value: number, unit: Kpi["unit"]): string {
  if (!Number.isFinite(value)) return "—";

  switch (unit) {
    case "currency":
      return `₹${Math.round(value).toLocaleString("en-IN")}`;
    case "percent":
      return `${Math.round(value)}%`;
    default:
      return Math.round(value).toLocaleString("en-IN");
  }
}

export type TrendDirection = "up" | "down" | "flat" | "unknown";

export function trendDirection(changePercent: number | null): TrendDirection {
  if (changePercent === null || !Number.isFinite(changePercent)) {
    return "unknown";
  }
  if (changePercent > 1) return "up";
  if (changePercent < -1) return "down";
  return "flat";
}

/**
 * An arrow is not enough: up is good for revenue and bad for churn. The
 * direction is paired with whether the metric is actually in trouble, which
 * the database decides from thresholds staff can read.
 */
export function trendLabel(kpi: Kpi): string {
  const direction = trendDirection(kpi.change_percent);

  switch (direction) {
    case "up":
      return `▲ ${Math.abs(kpi.change_percent ?? 0)}%`;
    case "down":
      return `▼ ${Math.abs(kpi.change_percent ?? 0)}%`;
    case "flat":
      return "No change";
    default:
      return "No comparison yet";
  }
}

/**
 * The metrics that need someone to do something, worst first. A dashboard
 * where everything is equally prominent tells staff nothing.
 */
export function attentionFirst(kpis: Kpi[]): Kpi[] {
  return [...kpis].sort((left, right) => {
    if (left.needs_attention !== right.needs_attention) {
      return left.needs_attention ? -1 : 1;
    }
    return (left.change_percent ?? 0) - (right.change_percent ?? 0);
  });
}

export type Forecast = {
  forecast_date: string;
  day_of_week: number;
  expected_visits: number;
  expected_guests: number;
  expected_revenue: number;
  sample_weeks: number;
  method: string;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function weekdayName(dayOfWeek: number): string {
  return WEEKDAYS[dayOfWeek] ?? "Unknown";
}

/**
 * How much to trust a forecast. Fewer than three comparable weeks is a guess,
 * and the dashboard says so rather than dressing it up.
 */
export function forecastConfidence(
  forecast: Forecast,
): "none" | "low" | "fair" | "good" {
  if (forecast.sample_weeks === 0) return "none";
  if (forecast.sample_weeks < 3) return "low";
  if (forecast.sample_weeks < 6) return "fair";
  return "good";
}

export function confidenceLabel(forecast: Forecast): string {
  switch (forecastConfidence(forecast)) {
    case "none":
      return "No history yet";
    case "low":
      return "Rough guess";
    case "fair":
      return "Reasonable";
    default:
      return "Well supported";
  }
}

export type RhythmCell = {
  day_of_week: number;
  hour_of_day: number;
  visit_count: number;
};

/**
 * The café's busiest and quietest trading hours, for staffing decisions.
 * Hours with no recorded visits are not "quiet" — they are unknown, and are
 * excluded rather than reported as zero.
 */
export function peakAndQuiet(cells: RhythmCell[]): {
  peak: RhythmCell | null;
  quiet: RhythmCell | null;
} {
  const trading = cells.filter((cell) => cell.visit_count > 0);

  if (trading.length === 0) return { peak: null, quiet: null };

  return {
    peak: trading.reduce((best, cell) =>
      cell.visit_count > best.visit_count ? cell : best,
    ),
    quiet: trading.reduce((worst, cell) =>
      cell.visit_count < worst.visit_count ? cell : worst,
    ),
  };
}

export function describeHour(hour: number): string {
  const period = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}${period}`;
}
