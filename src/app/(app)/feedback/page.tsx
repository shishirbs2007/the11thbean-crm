import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";
import { createFeedback, resolveFeedback } from "./actions";

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: queryError } = await searchParams;
  const { supabase } = await requireUser();

  const [{ data: feedbackData, error }, { data: peopleData }] =
    await Promise.all([
      supabase
        .from("customer_feedback")
        .select(
          "id, person_id, rating, feedback_type, message, resolution_status, created_at, people(first_name, last_name, preferred_name)",
        )
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("people")
        .select("id, first_name, last_name, preferred_name")
        .eq("is_active", true)
        .order("first_name"),
    ]);

  const feedback = feedbackData ?? [];
  const people = peopleData ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Service recovery"
        title="Feedback"
        description="Capture praise, concerns and service-recovery work in one place."
      />

      {(queryError || error) && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {queryError || error?.message}
        </p>
      )}

      <form
        action={createFeedback}
        className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2"
      >
        <select name="person_id" className="rounded-xl border px-4 py-3">
          <option value="">Anonymous or unknown customer</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.preferred_name || person.first_name}{" "}
              {person.last_name || ""}
            </option>
          ))}
        </select>

        <select
          name="feedback_type"
          className="rounded-xl border px-4 py-3"
        >
          <option value="general">General</option>
          <option value="compliment">Compliment</option>
          <option value="complaint">Complaint</option>
          <option value="suggestion">Suggestion</option>
          <option value="service_recovery">Service recovery</option>
        </select>

        <select name="rating" className="rounded-xl border px-4 py-3">
          <option value="">No rating</option>
          <option value="5">5</option>
          <option value="4">4</option>
          <option value="3">3</option>
          <option value="2">2</option>
          <option value="1">1</option>
        </select>

        <textarea
          name="message"
          placeholder="What happened?"
          className="min-h-24 rounded-xl border p-4 sm:col-span-2"
        />

        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">
          Record feedback
        </button>
      </form>

      <div className="mt-7 space-y-3">
        {feedback.map((item) => {
          const relation = Array.isArray(item.people)
            ? item.people[0]
            : item.people;
          const resolveAction = resolveFeedback.bind(null, item.id);

          return (
            <article key={item.id} className="rounded-2xl border p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {item.feedback_type}
                    {item.rating ? ` · ${item.rating}/5` : ""}
                  </p>
                  {relation && item.person_id && (
                    <Link
                      href={`/customers/${item.person_id}`}
                      className="mt-1 block text-sm underline"
                    >
                      {relation.preferred_name || relation.first_name}{" "}
                      {relation.last_name || ""}
                    </Link>
                  )}
                  {item.message && (
                    <p className="mt-2 text-sm text-neutral-600">
                      {item.message}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-neutral-500">
                    {item.resolution_status} ·{" "}
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>

                {item.resolution_status === "open" && (
                  <form action={resolveAction} className="flex gap-2">
                    <input
                      name="resolution_notes"
                      placeholder="Resolution note"
                      className="rounded-xl border px-3 py-2 text-sm"
                    />
                    <button className="rounded-xl border px-3 py-2 text-sm">
                      Resolve
                    </button>
                  </form>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
