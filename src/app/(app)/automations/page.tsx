import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  runAutomationNow,
  runDueAutomations,
  setAutomationState,
} from "./actions";

type Automation = {
  id: string;
  key: string;
  name: string;
  explanation: string;
  trigger_type: string;
  channel: string;
  purpose: string;
  is_active: boolean;
  run_interval_hours: number;
  last_run_at: string | null;
};

type Run = {
  id: string;
  automation_id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  candidates_found: number;
  actions_taken: number;
  skipped: number;
  failures: number;
  summary: string | null;
  triggered_by: string;
};

export default async function AutomationsPage() {
  const { supabase } = await requireUser();

  const [automationsResult, runsResult, failuresResult] = await Promise.all([
    supabase
      .from("hospitality_automations")
      .select(
        "id, key, name, explanation, trigger_type, channel, purpose, is_active, run_interval_hours, last_run_at",
      )
      .order("name"),
    supabase
      .from("automation_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(25),
    supabase
      .from("automation_run_items")
      .select("id, run_id, person_id, outcome, reason, detail, created_at")
      .eq("outcome", "failed")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const automations = (automationsResult.data ?? []) as Automation[];
  const runs = (runsResult.data ?? []) as Run[];
  const failures = failuresResult.data ?? [];

  const active = automations.filter((automation) => automation.is_active);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Automation"
        title="Hospitality automations"
        description="Work the café does for its guests without anyone having to remember. Every run is recorded, and every guest touched is recorded with the reason."
      />

      <ErrorPanel
        messages={[
          automationsResult.error?.message,
          runsResult.error?.message,
        ]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Switched on", `${active.length} of ${automations.length}`],
          ["Runs recorded", `${runs.length}`],
          [
            "Recent failures",
            `${runs.reduce((total, run) => total + run.failures, 0)}`,
          ],
        ].map(([label, text]) => (
          <div key={label} className="rounded-2xl border p-5">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Section
          title="Automations"
          description="Each says what it does and when. All ship switched off, so a café turns one on having read it."
        >
          <form action={runDueAutomations} className="mb-5">
            <SubmitButton
              pendingText="Running..."
              className="rounded-xl border px-4 py-2 text-sm"
            >
              Run everything that is due
            </SubmitButton>
          </form>

          <ul className="space-y-3">
            {automations.map((automation) => {
              const update = setAutomationState.bind(null, automation.id);
              const runNow = runAutomationNow.bind(null, automation.id);

              return (
                <li key={automation.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{automation.name}</p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {automation.explanation}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                        {automation.trigger_type} · {automation.channel} ·{" "}
                        every {automation.run_interval_hours}h ·{" "}
                        {automation.is_active ? "on" : "off"}
                        {automation.last_run_at &&
                          ` · last run ${new Date(
                            automation.last_run_at,
                          ).toLocaleString()}`}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <form action={update} className="flex gap-2">
                        <input
                          type="hidden"
                          name="is_active"
                          value={automation.is_active ? "false" : "true"}
                        />
                        <input
                          name="run_interval_hours"
                          type="number"
                          min="1"
                          defaultValue={automation.run_interval_hours}
                          aria-label={`How often ${automation.name} runs, in hours`}
                          className="w-24 rounded-xl border px-3 py-2 text-sm"
                        />
                        <SubmitButton
                          pendingText="Saving..."
                          className="rounded-xl border px-4 py-2 text-sm"
                        >
                          {automation.is_active ? "Turn off" : "Turn on"}
                        </SubmitButton>
                      </form>

                      {automation.is_active && (
                        <form action={runNow}>
                          <SubmitButton
                            pendingText="Running..."
                            className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                          >
                            Run now
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Execution history"
          description="What each run did, and whether anything went wrong."
        >
          {runs.length === 0 ? (
            <p className="text-neutral-600">Nothing has run yet.</p>
          ) : (
            <ul className="space-y-2">
              {runs.map((run) => (
                <li key={run.id} className="rounded-xl border p-3 text-sm">
                  <p
                    className={
                      run.status === "succeeded"
                        ? "font-medium"
                        : "font-medium text-amber-700"
                    }
                  >
                    {run.status} · {run.triggered_by} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {run.summary ?? "No summary recorded."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Failures"
          description="A failure against one guest never stops the rest of the run. Each one is kept here until somebody looks."
        >
          {failures.length === 0 ? (
            <p className="text-neutral-600">
              No automation has failed for a guest.
            </p>
          ) : (
            <ul className="space-y-2">
              {failures.map((failure) => (
                <li key={failure.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">{failure.reason}</p>
                  {failure.person_id && (
                    <Link
                      href={`/customers/${failure.person_id}`}
                      className="text-xs underline"
                    >
                      See the guest
                    </Link>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">
                    {JSON.stringify(failure.detail)}
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
