import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  groupTasksByUrgency,
  taskTypeLabel,
  type HospitalityTask,
} from "@/lib/intelligence/briefing";
import { addTask, completeTask, saveHandover } from "./actions";

type ExpectedGuest = {
  person_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  likelihood: number;
  reasons: string[];
};

type Handover = {
  id: string;
  shift_label: string;
  notes: string;
  guests_to_watch: string | null;
  created_at: string;
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

export default async function BriefingPage() {
  const { supabase } = await requireUser();

  // Generating today's tasks is idempotent, so the briefing is always current
  // without anyone having to remember to run anything.
  const generateResult = await supabase.rpc(
    "generate_daily_hospitality_tasks",
    {},
  );

  const today = new Date().toISOString().slice(0, 10);

  const [tasksResult, guestsResult, handoverResult, peopleResult] =
    await Promise.all([
      supabase
        .from("hospitality_tasks")
        .select(
          "id, person_id, task_type, title, detail, priority, status, due_on, people(first_name, last_name, preferred_name)",
        )
        .eq("status", "open")
        .lte("due_on", today)
        .order("priority")
        .order("created_at"),
      supabase.rpc("expected_guests_today", { max_results: 12 }),
      supabase
        .from("shift_handovers")
        .select("id, shift_label, notes, guests_to_watch, created_at")
        .order("created_at", { ascending: false })
        .limit(3),
      supabase
        .from("people")
        .select("id, first_name, last_name, preferred_name")
        .eq("is_active", true)
        .order("first_name")
        .limit(500),
    ]);

  const tasks = (tasksResult.data ?? []) as HospitalityTask[];
  const guests = (guestsResult.data ?? []) as ExpectedGuest[];
  const handovers = (handoverResult.data ?? []) as Handover[];
  const people = peopleResult.data ?? [];

  const { now, soon } = groupTasksByUrgency(tasks);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Today"
        title="Daily briefing"
        description="How do we create the best possible experience for today's guests?"
      />

      <ErrorPanel
        messages={[
          generateResult.error?.message,
          tasksResult.error?.message,
          guestsResult.error?.message,
          handoverResult.error?.message,
        ]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Needs attention now", `${now.length}`],
          ["Worth doing today", `${soon.length}`],
          ["Guests likely in", `${guests.length}`],
          [
            "Last handover",
            handovers[0]
              ? new Date(handovers[0].created_at).toLocaleDateString()
              : "None yet",
          ],
        ].map(([label, text]) => (
          <div key={label} className="rounded-2xl border p-5">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Who to welcome personally today"
          description="Regulars whose pattern says they are likely to walk in."
        >
          {guests.length === 0 ? (
            <p className="text-neutral-600">
              Nobody is clearly due today. Record a few more visits and the
              café&rsquo;s rhythms will start to show.
            </p>
          ) : (
            <ul className="space-y-3">
              {guests.map((guest) => (
                <li
                  key={guest.person_id}
                  className="rounded-xl bg-neutral-50 p-4"
                >
                  <Link
                    href={`/customers/${guest.person_id}`}
                    className="font-semibold underline"
                  >
                    {displayName(guest)}
                  </Link>
                  <p className="mt-1 text-sm text-neutral-600">
                    {guest.reasons.join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Needs attention now"
          description="Milestones today, and anything the café has to put right."
        >
          {now.length === 0 ? (
            <p className="text-neutral-600">Nothing urgent. A good morning.</p>
          ) : (
            <ul className="space-y-3">
              {now.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Worth doing today"
          description="Reconnections and welcomes that turn a customer into a regular."
        >
          {soon.length === 0 ? (
            <p className="text-neutral-600">Nothing outstanding.</p>
          ) : (
            <ul className="space-y-3">
              {soon.map((task) => (
                <TaskRow key={task.id} task={task} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Add a task"
          description="Anything the next person on shift should pick up."
        >
          <form action={addTask} className="grid gap-3">
            <input
              name="title"
              required
              placeholder="What needs doing"
              className="rounded-xl border px-3 py-2"
            />
            <select
              aria-label="Choose a customer"
              name="person_id"
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Not about a specific guest</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                </option>
              ))}
            </select>
            <input
              name="detail"
              placeholder="Anything else worth knowing"
              className="rounded-xl border px-3 py-2"
            />
            <select
              aria-label="Priority"
              name="priority"
              defaultValue="3"
              className="rounded-xl border px-3 py-2"
            >
              <option value="1">Do it now</option>
              <option value="2">Today</option>
              <option value="3">When there is a moment</option>
            </select>
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white">
              Add task
            </SubmitButton>
          </form>
        </Section>

        <Section
          title="Shift handover"
          description="What the next shift needs to know. Keep it short enough to be read."
        >
          <form action={saveHandover} className="grid gap-3">
            <select
              aria-label="Which shift"
              name="shift_label"
              defaultValue="day"
              className="rounded-xl border px-3 py-2"
            >
              <option value="morning">Morning</option>
              <option value="day">Day</option>
              <option value="evening">Evening</option>
            </select>
            <textarea
              name="notes"
              required
              placeholder="How the shift went, what to look out for"
              className="min-h-28 rounded-xl border p-3"
            />
            <input
              name="guests_to_watch"
              placeholder="Guests worth a personal word"
              className="rounded-xl border px-3 py-2"
            />
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white">
              Save handover
            </SubmitButton>
          </form>

          {handovers.length > 0 && (
            <ul className="mt-5 space-y-3">
              {handovers.map((handover) => (
                <li key={handover.id} className="rounded-xl border p-4 text-sm">
                  <p className="font-medium">
                    {handover.shift_label} ·{" "}
                    {new Date(handover.created_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-neutral-600">{handover.notes}</p>
                  {handover.guests_to_watch && (
                    <p className="mt-1 text-neutral-500">
                      Watch for: {handover.guests_to_watch}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}

function TaskRow({ task }: { task: HospitalityTask }) {
  const complete = completeTask.bind(null, task.id);
  const person = Array.isArray(task.people) ? task.people[0] : task.people;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4">
      <div>
        <p className="font-semibold">{task.title}</p>
        {task.detail && (
          <p className="mt-1 text-sm text-neutral-600">{task.detail}</p>
        )}
        <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
          {taskTypeLabel(task.task_type)}
          {person && task.person_id && (
            <>
              {" · "}
              <Link href={`/customers/${task.person_id}`} className="underline">
                {displayName(person)}
              </Link>
            </>
          )}
        </p>
      </div>
      <div className="flex gap-2">
        {[
          ["done", "Done"],
          ["dismissed", "Not needed"],
        ].map(([outcome, label]) => (
          <form key={outcome} action={complete}>
            <input type="hidden" name="outcome" value={outcome} />
            <SubmitButton
              pendingText="Saving..."
              className="rounded-xl border px-3 py-2 text-sm"
            >
              {label}
            </SubmitButton>
          </form>
        ))}
      </div>
    </li>
  );
}
