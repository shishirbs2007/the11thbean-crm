import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  configuredSinks,
  overallStatus,
  statusWording,
  troubleFirst,
  type HealthCheck,
} from "@/lib/monitoring/incidents";
import { acknowledgeAllInArea, acknowledgeIncident } from "./actions";

type Incident = {
  id: string;
  occurred_at: string;
  severity: string;
  area: string;
  summary: string;
  detail: string | null;
  person_id: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  error: "border-red-300 bg-red-50",
  warning: "border-amber-300 bg-amber-50",
  ok: "border-neutral-200",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "text-red-800",
  error: "text-red-700",
  warning: "text-amber-700",
  info: "text-neutral-600",
};

export default async function SystemPage() {
  const { supabase } = await requireUser();

  const [checksResult, incidentsResult, arrivalResult] = await Promise.all([
    supabase.rpc("system_health_checks"),
    supabase
      .from("system_incidents")
      .select("id, occurred_at, severity, area, summary, detail, person_id")
      .is("acknowledged_at", null)
      .order("occurred_at", { ascending: false })
      .limit(40),
    supabase.rpc("arrival_metrics", { period_days: 7 }),
  ]);

  const arrival = (arrivalResult.data ?? {}) as Record<string, number | null>;
  const arrivalCount = Number(arrival.arrivals ?? 0);

  const checks = (checksResult.data ?? []) as HealthCheck[];
  const incidents = (incidentsResult.data ?? []) as Incident[];

  const status = overallStatus(checks);
  const ranked = troubleFirst(checks);
  const trouble = ranked.filter((check) => check.status !== "ok");
  const sinks = configuredSinks();

  const areas = [...new Set(incidents.map((incident) => incident.area))];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="System"
        title="Is this working?"
        description="One place that answers it. Everything here is measured from the café's own records."
      />

      <ErrorPanel
        messages={[checksResult.error?.message, incidentsResult.error?.message]}
      />

      <div
        className={`mt-8 rounded-2xl border p-6 ${STATUS_STYLES[status]}`}
        role="status"
      >
        <p className="text-2xl font-semibold">{statusWording(status)}</p>
        <p className="mt-2 text-sm">
          {trouble.length === 0
            ? `All ${checks.length} checks are healthy.`
            : `${trouble.length} of ${checks.length} checks want attention.`}
          {incidents.length > 0 &&
            ` ${incidents.length} unacknowledged incident${
              incidents.length === 1 ? "" : "s"
            }.`}
        </p>
      </div>

      {arrivalCount > 0 && (
        <div className="mt-8">
          <Section
            title="Arrival, this week"
            description="How the counter interaction is performing. All figures are aggregate — no guest and no member of staff is identified."
          >
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["Guests welcomed", `${arrivalCount}`],
                [
                  "Typical arrival",
                  arrival.median_arrival_ms
                    ? `${(Number(arrival.median_arrival_ms) / 1000).toFixed(1)}s`
                    : "—",
                ],
                [
                  "Typical search",
                  arrival.median_search_ms
                    ? `${Number(arrival.median_search_ms)}ms`
                    : "—",
                ],
                [
                  "Slower arrivals (p90)",
                  arrival.p90_arrival_ms
                    ? `${(Number(arrival.p90_arrival_ms) / 1000).toFixed(1)}s`
                    : "—",
                ],
                [
                  "Keyboard vs tap",
                  `${Number(arrival.keyboard_arrivals ?? 0)} / ${Number(
                    arrival.pointer_arrivals ?? 0,
                  )}`,
                ],
                ["Scanned", `${Number(arrival.scan_arrivals ?? 0)}`],
                [
                  "Duplicates prevented",
                  `${Number(arrival.duplicates_prevented ?? 0)}`,
                ],
                ["Retries", `${Number(arrival.retries ?? 0)}`],
                ["New guests added", `${Number(arrival.quick_adds ?? 0)}`],
                [
                  "Searches abandoned",
                  `${Number(arrival.abandoned_searches ?? 0)}`,
                ],
                [
                  "Search → welcome",
                  arrival.search_to_arrival_percent != null
                    ? `${Number(arrival.search_to_arrival_percent)}%`
                    : "—",
                ],
              ].map(([label, text]) => (
                <div key={label} className="rounded-2xl border p-5">
                  <p className="text-sm text-neutral-500">{label}</p>
                  <p className="mt-2 text-2xl font-semibold">{text}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}

      <div className="mt-8">
        <Section
          title="Health checks"
          description="Each says what it measured and what to do about it. Problems first."
        >
          <ul className="space-y-3">
            {ranked.map((check) => (
              <li
                key={check.check_key}
                className={`rounded-xl border p-4 ${STATUS_STYLES[check.status]}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide">
                      {check.status}
                    </p>
                    <p className="font-semibold">{check.label}</p>
                    <p className="mt-1 text-sm">{check.detail}</p>
                    {check.status !== "ok" && (
                      <p className="mt-2 text-sm font-medium">
                        {check.recommended_action}
                      </p>
                    )}
                  </div>
                  <Link
                    href={check.drill_down_path}
                    className="text-sm underline"
                  >
                    Look at this
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Unacknowledged incidents"
          description="Anything that failed where nobody would otherwise have noticed. Acknowledging records that somebody looked, so the next real one stands out."
        >
          {incidents.length === 0 ? (
            <p className="text-neutral-600">
              Nothing has failed unnoticed. This is what a good week looks like.
            </p>
          ) : (
            <>
              {areas.length > 1 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {areas.map((area) => {
                    const acknowledgeArea = acknowledgeAllInArea.bind(null, area);

                    return (
                      <form key={area} action={acknowledgeArea}>
                        <SubmitButton
                          pendingText="Saving..."
                          className="rounded-xl border px-3 py-2 text-sm"
                        >
                          Acknowledge all {area}
                        </SubmitButton>
                      </form>
                    );
                  })}
                </div>
              )}

              <ul className="space-y-2">
                {incidents.map((incident) => {
                  const acknowledge = acknowledgeIncident.bind(null, incident.id);

                  return (
                    <li
                      key={incident.id}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
                    >
                      <div>
                        <p
                          className={`font-medium ${
                            SEVERITY_STYLES[incident.severity] ?? ""
                          }`}
                        >
                          {incident.summary}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                          {incident.area} · {incident.severity} ·{" "}
                          {new Date(incident.occurred_at).toLocaleString()}
                        </p>
                        {incident.detail && (
                          <p className="mt-1 text-sm text-neutral-600">
                            {incident.detail}
                          </p>
                        )}
                        {incident.person_id && (
                          <Link
                            href={`/customers/${incident.person_id}`}
                            className="mt-1 inline-block text-xs underline"
                          >
                            See the guest affected
                          </Link>
                        )}
                      </div>
                      <form action={acknowledge}>
                        <SubmitButton
                          pendingText="Saving..."
                          className="rounded-xl border px-3 py-2 text-sm"
                        >
                          Acknowledge
                        </SubmitButton>
                      </form>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Alerting"
          description="Whether anything outside the CRM is listening."
        >
          {sinks.length === 0 ? (
            <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-medium">
                No external alerting is configured.
              </p>
              <p className="mt-1">
                Incidents are recorded here, but nobody is told about them. If
                the café is relying on this system daily, somebody should learn
                about a failure without opening this page.
              </p>
              <p className="mt-2">
                Register an incident sink in{" "}
                <code>src/lib/monitoring/incidents.ts</code>. Nothing that
                reports an incident needs to change.
              </p>
            </div>
          ) : (
            <p className="text-neutral-600">
              Incidents are also delivered to: {sinks.join(", ")}.
            </p>
          )}
        </Section>
      </div>
    </main>
  );
}
