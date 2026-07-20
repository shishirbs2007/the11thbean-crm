/**
 * Daily briefing intelligence.
 *
 * The scoring itself lives in SQL, in the hospitality signal registry. What
 * lives here is presentation: how a shift reads its own workload without
 * having to think about priority numbers.
 */

export type TaskPerson = {
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
};

export type HospitalityTask = {
  id: string;
  person_id: string | null;
  task_type: string;
  title: string;
  detail: string | null;
  priority: number;
  status: string;
  due_on: string;
  people: TaskPerson | TaskPerson[] | null;
};

const TASK_TYPE_LABELS: Record<string, string> = {
  milestone: "Milestone today",
  reconnect: "Drifting away",
  welcome_back: "Still new here",
  service_recovery: "Needs putting right",
  staff_note: "Added by staff",
};

export function taskTypeLabel(taskType: string): string {
  return TASK_TYPE_LABELS[taskType] ?? taskType.replace(/_/g, " ");
}

/**
 * Splits the day's work into what cannot wait and what should happen if there
 * is a moment. Milestones and service recovery are always "now": a birthday
 * missed is missed, and an apology delayed stops being an apology.
 */
export function groupTasksByUrgency(tasks: HospitalityTask[]): {
  now: HospitalityTask[];
  soon: HospitalityTask[];
} {
  const now: HospitalityTask[] = [];
  const soon: HospitalityTask[] = [];

  for (const task of tasks) {
    if (task.priority <= 1 || task.task_type === "service_recovery") {
      now.push(task);
    } else {
      soon.push(task);
    }
  }

  return { now, soon };
}

export type SignalBreakdown = {
  key: string;
  label: string;
  strength: number;
  weight: number;
};

export type HospitalityScore = {
  score: number;
  signals: SignalBreakdown[];
};

/**
 * Normalises the jsonb returned by hospitality_score, tolerating a guest the
 * café barely knows yet.
 */
export function parseHospitalityScore(value: unknown): HospitalityScore {
  if (!value || typeof value !== "object") return { score: 0, signals: [] };

  const source = value as Record<string, unknown>;
  const rawSignals = Array.isArray(source.signals) ? source.signals : [];

  return {
    score: Number(source.score ?? 0),
    signals: rawSignals.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const signal = entry as Record<string, unknown>;
      if (typeof signal.key !== "string") return [];

      return [
        {
          key: signal.key,
          label:
            typeof signal.label === "string" ? signal.label : signal.key,
          strength: Number(signal.strength ?? 0),
          weight: Number(signal.weight ?? 0),
        },
      ];
    }),
  };
}

/**
 * The two or three things that most explain why a guest matters right now,
 * phrased for someone about to walk up to their table.
 */
export function topSignals(
  score: HospitalityScore,
  limit = 3,
): SignalBreakdown[] {
  return [...score.signals]
    .sort((left, right) => right.strength * right.weight - left.strength * left.weight)
    .slice(0, limit);
}
