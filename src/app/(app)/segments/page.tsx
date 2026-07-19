import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";
import {
  addSegmentMember,
  createSegment,
  removeSegmentMember,
} from "./actions";

export default async function SegmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireUser();

  const [segmentsResult, peopleResult] = await Promise.all([
    supabase
      .from("saved_segments")
      .select(
        "id,name,description,filter_definition,segment_memberships(person_id,people(first_name,last_name,preferred_name))",
      )
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("people")
      .select("id,first_name,last_name,preferred_name")
      .eq("is_active", true)
      .order("first_name"),
  ]);

  const segments = segmentsResult.data ?? [];
  const people = peopleResult.data ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Customer intelligence"
        title="Segments"
        description="Reusable customer groups for recognition, outreach and community programming."
      />

      {(params.error || segmentsResult.error) && (
        <p className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {params.error || segmentsResult.error?.message}
        </p>
      )}

      {params.success && (
        <p className="mt-5 rounded-xl border border-green-300 bg-green-50 p-4 text-green-800">
          {params.success}
        </p>
      )}

      <form action={createSegment} className="mt-7 grid gap-3 rounded-2xl border p-6 sm:grid-cols-2 lg:grid-cols-3">
        <input name="name" required placeholder="Segment name" className="rounded-xl border px-3 py-2" />
        <input name="description" placeholder="Description" className="rounded-xl border px-3 py-2 lg:col-span-2" />
        <input name="customer_status" placeholder="Customer status, optional" className="rounded-xl border px-3 py-2" />
        <input name="minimum_visits" type="number" min="0" placeholder="Minimum visits" className="rounded-xl border px-3 py-2" />
        <input name="minimum_lifetime_value" type="number" min="0" placeholder="Minimum lifetime value" className="rounded-xl border px-3 py-2" />
        <input name="maximum_churn_risk" type="number" min="0" max="100" placeholder="Maximum churn risk" className="rounded-xl border px-3 py-2" />
        <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2 lg:col-span-3">
          Create segment
        </button>
      </form>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {segments.map((segment) => (
          <section key={segment.id} className="rounded-2xl border p-6">
            <h2 className="text-lg font-semibold">{segment.name}</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {segment.description || "No description"}
            </p>

            <pre className="mt-4 overflow-auto rounded-xl bg-neutral-50 p-3 text-xs">
              {JSON.stringify(segment.filter_definition, null, 2)}
            </pre>

            <form action={addSegmentMember.bind(null, segment.id)} className="mt-5 flex gap-2">
              <select name="person_id" required className="min-w-0 flex-1 rounded-xl border px-3 py-2">
                <option value="">Add customer</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.preferred_name || person.first_name}{" "}
                    {person.last_name || ""}
                  </option>
                ))}
              </select>
              <button className="rounded-xl border px-4 py-2">Add</button>
            </form>

            <div className="mt-5 space-y-2">
              {(segment.segment_memberships ?? []).map((membership) => {
                const person = Array.isArray(membership.people)
                  ? membership.people[0]
                  : membership.people;
                return (
                  <div key={membership.person_id} className="flex justify-between rounded-xl bg-neutral-50 p-3 text-sm">
                    <span>
                      {person?.preferred_name || person?.first_name || "Unknown"}{" "}
                      {person?.last_name || ""}
                    </span>
                    <form action={removeSegmentMember.bind(null, segment.id, membership.person_id)}>
                      <button className="text-red-700">Remove</button>
                    </form>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
