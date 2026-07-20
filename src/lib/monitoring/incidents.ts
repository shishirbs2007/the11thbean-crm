/**
 * Incident capture.
 *
 * Anything that fails where a member of staff would otherwise never learn of
 * it gets recorded here. The record lands in the database first, so the café
 * has a history whether or not an external service is ever configured.
 *
 * Dispatch to something like Sentry is a separate concern, deliberately: the
 * checks and the capture points do not know or care whether anyone is
 * listening. Adding a sink later changes nothing that calls this.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type Severity = "info" | "warning" | "error" | "critical";

export type Incident = {
  /** Where it happened, in the words a person would use: "briefing", "import". */
  area: string;
  summary: string;
  detail?: string;
  severity?: Severity;
  /** Diagnostic context. Never anything identifying a guest beyond an id. */
  context?: Record<string, unknown>;
  personId?: string;
};

/**
 * Somewhere an incident can be sent in addition to the database. An external
 * monitoring service implements this and is registered at startup.
 */
export type IncidentSink = {
  name: string;
  isConfigured(): boolean;
  deliver(incident: Incident): Promise<void>;
};

const sinks: IncidentSink[] = [];

export function registerIncidentSink(sink: IncidentSink): void {
  sinks.push(sink);
}

export function configuredSinks(): string[] {
  return sinks.filter((sink) => sink.isConfigured()).map((sink) => sink.name);
}

/** Only used by tests, to keep registrations from leaking between cases. */
export function clearIncidentSinks(): void {
  sinks.length = 0;
}

/**
 * Turns whatever was thrown into something readable. Errors, strings, and the
 * objects that libraries sometimes reject with all arrive here.
 */
export function describeError(error: unknown): {
  summary: string;
  detail: string;
} {
  if (error instanceof Error) {
    return {
      summary: error.message || error.name,
      detail: error.stack ?? error.name,
    };
  }

  if (typeof error === "string") {
    return { summary: error, detail: error };
  }

  try {
    const serialised = JSON.stringify(error);
    return { summary: "Non-error thrown", detail: serialised };
  } catch {
    return { summary: "Non-error thrown", detail: String(error) };
  }
}

/**
 * Records an incident.
 *
 * Never throws. Monitoring that fails loudly turns a small problem into a page
 * that will not load, which is worse than the problem it was reporting.
 */
export async function recordIncident(
  supabase: SupabaseClient,
  incident: Incident,
): Promise<void> {
  try {
    await supabase.rpc("record_incident", {
      incident_area: incident.area,
      incident_summary: incident.summary,
      incident_detail: incident.detail ?? null,
      incident_severity: incident.severity ?? "error",
      incident_context: incident.context ?? {},
      subject_person_id: incident.personId ?? null,
    });
  } catch {
    // Deliberately swallowed. The console is the last resort.
    console.error("[monitoring] could not record incident:", incident.summary);
  }

  for (const sink of sinks) {
    if (!sink.isConfigured()) continue;

    try {
      await sink.deliver(incident);
    } catch {
      console.error(`[monitoring] sink ${sink.name} failed to deliver`);
    }
  }
}

/**
 * Wraps work that should report its own failures.
 *
 * The error is recorded and then rethrown, because swallowing it here would
 * leave the caller believing something succeeded.
 */
export async function withIncidentReporting<T>(
  supabase: SupabaseClient,
  area: string,
  work: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    const { summary, detail } = describeError(error);

    await recordIncident(supabase, {
      area,
      summary,
      detail,
      severity: "error",
      context,
    });

    throw error;
  }
}

export type HealthCheck = {
  check_key: string;
  label: string;
  status: "ok" | "warning" | "error";
  detail: string;
  recommended_action: string;
  drill_down_path: string;
};

/**
 * The worst status across all checks, which is what the café should see first.
 */
export function overallStatus(checks: HealthCheck[]): "ok" | "warning" | "error" {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

export function statusWording(status: "ok" | "warning" | "error"): string {
  switch (status) {
    case "error":
      return "Something needs attention";
    case "warning":
      return "Worth a look";
    default:
      return "Everything is working";
  }
}

/** Problems first. A list where the trouble is buried is not a status page. */
export function troubleFirst(checks: HealthCheck[]): HealthCheck[] {
  const weight = { error: 0, warning: 1, ok: 2 };
  return [...checks].sort(
    (left, right) => weight[left.status] - weight[right.status],
  );
}
