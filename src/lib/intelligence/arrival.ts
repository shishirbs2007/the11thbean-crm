/**
 * Arrival context.
 *
 * The counter is the least forgiving place in the café to show a broken
 * screen: somebody is standing there. Everything here tolerates a missing or
 * malformed field and renders something a person can still act on.
 */

import {
  parseNextBestAction,
  type NextBestAction,
} from "./recommendations";

export type ArrivalContext = {
  person_id: string;
  name: string;
  greeting_name: string;
  allergies: string[];
  dietary: string[];
  usual_drink: string;
  usual_food: string;
  seating: string;
  total_visits: number;
  days_since_visit: number | null;
  is_first_visit: boolean;
  staff_summary: string;
  communities: string[];
  next_best_action: NextBestAction | null;
  open_tasks: { title: string; detail: string | null }[];
};

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseArrivalContext(value: unknown): ArrivalContext | null {
  if (!value || typeof value !== "object") return null;

  const source = value as Record<string, unknown>;

  if (typeof source.person_id !== "string") return null;

  const rawTasks = Array.isArray(source.open_tasks) ? source.open_tasks : [];

  return {
    person_id: source.person_id,
    name: text(source.name),
    greeting_name: text(source.greeting_name) || text(source.name),
    allergies: stringArray(source.allergies),
    dietary: stringArray(source.dietary),
    usual_drink: text(source.usual_drink),
    usual_food: text(source.usual_food),
    seating: text(source.seating),
    total_visits: Number(source.total_visits ?? 0),
    days_since_visit:
      source.days_since_visit === null || source.days_since_visit === undefined
        ? null
        : Number(source.days_since_visit),
    is_first_visit: source.is_first_visit === true,
    staff_summary: text(source.staff_summary),
    communities: stringArray(source.communities),
    next_best_action: source.next_best_action
      ? parseNextBestAction(source.next_best_action)
      : null,
    open_tasks: rawTasks.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const task = entry as Record<string, unknown>;
      if (typeof task.title !== "string") return [];
      return [
        {
          title: task.title,
          detail: typeof task.detail === "string" ? task.detail : null,
        },
      ];
    }),
  };
}

/**
 * What to say when the guest is standing there.
 *
 * Safety before warmth, warmth before commerce — the same order the
 * hospitality suggestions use, because it is the order that matters when
 * somebody is waiting.
 */
export function greetingLine(context: ArrivalContext): string {
  if (context.allergies.length > 0) {
    return `${context.greeting_name} — allergic to ${context.allergies.join(", ")}`;
  }

  if (context.is_first_visit) {
    return `${context.greeting_name} — first time here`;
  }

  if (context.usual_drink) {
    return `${context.greeting_name} — usually a ${context.usual_drink}`;
  }

  return `${context.greeting_name} — ${context.total_visits} visits, usual not known yet`;
}

/**
 * True when the café knows so little that staff should ask rather than assume.
 * Being honest about ignorance is better than a confident wrong greeting.
 */
export function needsGettingToKnow(context: ArrivalContext): boolean {
  return (
    !context.usual_drink &&
    !context.staff_summary &&
    context.allergies.length === 0
  );
}
