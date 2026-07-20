import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";
import { completeFollowUp, createFollowUp } from "./actions";

type PersonOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
};

export default async function FollowUpsPage() {
  const { supabase } = await requireUser();

  const [{ data: tasksData, error }, { data: peopleData }] = await Promise.all([
    supabase
      .from("customer_tasks")
      .select(
        "id, person_id, title, description, due_at, priority, status, people(first_name, last_name, preferred_name)",
      )
      .eq("status", "open")
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name")
      .eq("is_active", true)
      .order("first_name"),
  ]);

  const tasks = tasksData ?? [];
  const people = (peopleData ?? []) as PersonOption[];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Relationship work"
        title="Follow-ups"
        description="Keep promises, reconnect thoughtfully and prevent customer context from falling through the cracks."
      />

      <ErrorPanel messages={[error?.message]} />

      <form
        action={createFollowUp}
        className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2"
      >
        <select
          aria-label="Choose a customer"
          name="person_id"
          className="rounded-xl border px-4 py-3"
        >
          <option value="">General café task</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.preferred_name || person.first_name}{" "}
              {person.last_name || ""}
            </option>
          ))}
        </select>

        <input
          name="title"
          required
          placeholder="Follow-up title"
          className="rounded-xl border px-4 py-3"
        />

        <input
          name="due_at"
          type="datetime-local"
          className="rounded-xl border px-4 py-3"
        />

        <select
          aria-label="Priority"
          name="priority"
          className="rounded-xl border px-4 py-3"
        >
          <option value="normal">Normal priority</option>
          <option value="high">High priority</option>
          <option value="urgent">Urgent</option>
        </select>

        <textarea
          name="description"
          placeholder="Context or next action"
          className="min-h-24 rounded-xl border p-4 sm:col-span-2"
        />

        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">
          Create follow-up
        </button>
      </form>

      <div className="mt-7 space-y-3">
        {tasks.length === 0 ? (
          <p className="rounded-2xl border p-6 text-neutral-600">
            No open follow-ups.
          </p>
        ) : (
          tasks.map((task) => {
            const relation = Array.isArray(task.people)
              ? task.people[0]
              : task.people;
            const completeAction = completeFollowUp.bind(null, task.id);

            return (
              <article key={task.id} className="rounded-2xl border p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">{task.title}</p>
                    {relation && task.person_id && (
                      <Link
                        href={`/customers/${task.person_id}`}
                        className="mt-1 block text-sm underline"
                      >
                        {relation.preferred_name || relation.first_name}{" "}
                        {relation.last_name || ""}
                      </Link>
                    )}
                    {task.description && (
                      <p className="mt-2 text-sm text-neutral-600">
                        {task.description}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-neutral-500">
                      {task.priority}
                      {task.due_at
                        ? ` · Due ${new Date(task.due_at).toLocaleString()}`
                        : " · No due date"}
                    </p>
                  </div>

                  <form action={completeAction}>
                    <button className="rounded-xl border px-4 py-2 text-sm">
                      Complete
                    </button>
                  </form>
                </div>
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
