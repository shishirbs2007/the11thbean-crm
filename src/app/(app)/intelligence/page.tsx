import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import {
  attentionFirst,
  confidenceLabel,
  describeHour,
  formatMetric,
  peakAndQuiet,
  trendLabel,
  weekdayName,
  type Forecast,
  type Kpi,
  type RhythmCell,
} from "@/lib/intelligence/business";

type Drifting = {
  person_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  days_since_visit: number;
  average_gap_days: number;
  lifetime_value: number;
  reason: string;
};

type Story = {
  person_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  total_visits: number;
  days_to_regular: number;
  hospitality_actions: number;
  events_attended: number;
  communities_joined: number;
};

function displayName(person: {
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
}): string {
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

export default async function IntelligencePage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period } = await searchParams;
  const { supabase } = await requireUser();

  const periodDays = [7, 30, 90].includes(Number(period)) ? Number(period) : 30;

  const [
    kpiResult,
    forecastResult,
    driftingResult,
    storiesResult,
    rhythmResult,
  ] = await Promise.all([
    supabase.rpc("executive_kpis", { period_days: periodDays }),
    supabase.rpc("forecast_demand", { days_ahead: 7 }),
    supabase.rpc("drifting_regulars", { max_results: 10 }),
    supabase.rpc("conversion_stories", { max_results: 10 }),
    supabase.from("operational_rhythm").select("*"),
  ]);

  const kpis = (kpiResult.data ?? []) as Kpi[];
  const forecasts = (forecastResult.data ?? []) as Forecast[];
  const drifting = (driftingResult.data ?? []) as Drifting[];
  const stories = (storiesResult.data ?? []) as Story[];
  const rhythm = (rhythmResult.data ?? []) as RhythmCell[];

  const ranked = attentionFirst(kpis);
  const needsAttention = ranked.filter((entry) => entry.needs_attention);
  const { peak, quiet } = peakAndQuiet(rhythm);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Business intelligence"
        title="How the café is doing"
        description="What happened, why it happened, and what to do next. Every number links to the records behind it."
      />

      <ErrorPanel
        messages={[
          kpiResult.error?.message,
          forecastResult.error?.message,
          driftingResult.error?.message,
          rhythmResult.error?.message,
        ]}
      />

      <nav className="mt-6 flex gap-2" aria-label="Reporting period">
        {[7, 30, 90].map((days) => (
          <Link
            key={days}
            href={`/intelligence?period=${days}`}
            aria-current={days === periodDays ? "page" : undefined}
            className={
              days === periodDays
                ? "rounded-xl bg-black px-4 py-2 text-sm text-white"
                : "rounded-xl border px-4 py-2 text-sm"
            }
          >
            Last {days} days
          </Link>
        ))}
      </nav>

      {needsAttention.length > 0 && (
        <div className="mt-8">
          <Section
            title="What needs a decision"
            description="Metrics outside the range the café set for itself."
          >
            <ul className="space-y-3">
              {needsAttention.map((entry) => (
                <li
                  key={entry.key}
                  className="rounded-xl bg-amber-50 p-4 text-amber-900"
                >
                  <p className="font-semibold">
                    {entry.label}: {formatMetric(entry.value, entry.unit)}
                  </p>
                  <p className="mt-1 text-sm">{entry.explanation}</p>
                  <p className="mt-2 text-sm font-medium">
                    {entry.recommended_action}
                  </p>
                  <Link
                    href={entry.drill_down_path}
                    className="mt-2 inline-block text-sm underline"
                  >
                    See the records behind this
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <div className="mt-8">
        <Section
          title="Every measure"
          description="Each one shows where it came from and what it suggests doing."
        >
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((entry) => (
              <article
                key={entry.key}
                className={
                  entry.needs_attention
                    ? "rounded-2xl border border-amber-300 p-5"
                    : "rounded-2xl border p-5"
                }
              >
                <p className="text-sm text-neutral-500">{entry.label}</p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatMetric(entry.value, entry.unit)}
                </p>
                <p className="mt-1 text-sm text-neutral-600">
                  {trendLabel(entry)}
                </p>
                <p className="mt-3 text-sm">{entry.explanation}</p>
                <p className="mt-2 text-sm text-neutral-600">
                  {entry.recommended_action}
                </p>
                <Link
                  href={entry.drill_down_path}
                  className="mt-3 inline-block text-sm underline"
                >
                  Where this comes from
                </Link>
              </article>
            ))}
          </div>
        </Section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Regulars drifting away"
          description="Measured against each guest's own rhythm, not a fixed cutoff."
        >
          {drifting.length === 0 ? (
            <p className="text-neutral-600">
              Nobody is overdue against their own pattern.
            </p>
          ) : (
            <ul className="space-y-3">
              {drifting.map((guest) => (
                <li key={guest.person_id} className="rounded-xl border p-4">
                  <Link
                    href={`/customers/${guest.person_id}`}
                    className="font-semibold underline"
                  >
                    {displayName(guest)}
                  </Link>
                  <p className="mt-1 text-sm text-neutral-600">
                    {guest.reason}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Lifetime value{" "}
                    {formatMetric(guest.lifetime_value, "currency")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="What the week should look like"
          description="Average of the same weekday over the last twelve weeks. Simple enough to check by hand."
        >
          <ul className="space-y-2">
            {forecasts.map((entry) => (
              <li
                key={entry.forecast_date}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <p className="font-medium">
                    {weekdayName(entry.day_of_week)}{" "}
                    <span className="text-neutral-500">
                      {entry.forecast_date}
                    </span>
                  </p>
                  <p className="text-xs text-neutral-500">{entry.method}</p>
                </div>
                <div className="text-right text-sm">
                  <p>
                    {Math.round(entry.expected_visits)} visits ·{" "}
                    {formatMetric(entry.expected_revenue, "currency")}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {confidenceLabel(entry)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="When the café is busy"
          description="Recorded visits over the last ninety days."
        >
          {peak && quiet ? (
            <div className="space-y-3">
              <p>
                Busiest: <strong>{weekdayName(peak.day_of_week)}</strong> around{" "}
                <strong>{describeHour(peak.hour_of_day)}</strong>, about{" "}
                {peak.visit_count} visits.
              </p>
              <p>
                Quietest trading hour:{" "}
                <strong>{weekdayName(quiet.day_of_week)}</strong> around{" "}
                <strong>{describeHour(quiet.hour_of_day)}</strong>, about{" "}
                {quiet.visit_count} visits.
              </p>
              <Link href="/visits" className="inline-block text-sm underline">
                See the visits behind this
              </Link>
            </div>
          ) : (
            <p className="text-neutral-600">
              Not enough recorded visits yet to see a rhythm.
            </p>
          )}
        </Section>

        <Section
          title="Guests who became regulars"
          description="What the café did between someone's first visit and their fifth."
        >
          {stories.length === 0 ? (
            <p className="text-neutral-600">
              No guest has reached five visits yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {stories.map((story) => (
                <li key={story.person_id} className="rounded-xl border p-4">
                  <Link
                    href={`/customers/${story.person_id}`}
                    className="font-semibold underline"
                  >
                    {displayName(story)}
                  </Link>
                  <p className="mt-1 text-sm text-neutral-600">
                    {story.total_visits} visits over {story.days_to_regular}{" "}
                    days · {story.hospitality_actions} hospitality actions ·{" "}
                    {story.events_attended} events · {story.communities_joined}{" "}
                    communities
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
