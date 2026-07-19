import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addNote, addPreference, updatePerson } from "../actions";

type PersonRecord = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  email: string | null;
  occupation: string | null;
  company: string | null;
};

type NoteRecord = {
  id: string;
  note: string;
  visibility: "barista" | "manager" | "private";
  created_at: string;
};

type PreferenceRecord = {
  id: string;
  preference_type: string;
  preference_value: string;
  created_at: string;
};

type VisitRecord = {
  id: string;
  visited_at: string;
  net_amount: number | null;
  source: string;
};

type MembershipRecord = {
  role: string;
  joined_at: string | null;
  communities: { name: string } | { name: string }[] | null;
};

type RegistrationRecord = {
  status: string;
  registered_at: string;
  events: { name: string; starts_at: string } | { name: string; starts_at: string }[] | null;
};

function relatedName(
  relation: { name: string } | { name: string }[] | null,
): string {
  if (!relation) return "Unknown";
  return Array.isArray(relation)
    ? relation[0]?.name || "Unknown"
    : relation.name;
}

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error: queryError } = await searchParams;
  const { supabase } = await requireUser();

  const [
    personResult,
    notesResult,
    preferencesResult,
    visitsResult,
    membershipsResult,
    registrationsResult,
  ] = await Promise.all([
    supabase.from("people").select("*").eq("id", id).single(),
    supabase
      .from("customer_notes")
      .select("id, note, visibility, created_at")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("customer_preferences")
      .select("id, preference_type, preference_value, created_at")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("id, visited_at, net_amount, source")
      .eq("person_id", id)
      .order("visited_at", { ascending: false })
      .limit(20),
    supabase
      .from("community_memberships")
      .select("role, joined_at, communities(name)")
      .eq("person_id", id),
    supabase
      .from("event_registrations")
      .select("status, registered_at, events(name, starts_at)")
      .eq("person_id", id),
  ]);

  const person = personResult.data as PersonRecord | null;
  if (!person) notFound();

  const notes: NoteRecord[] = (notesResult.data ?? []) as NoteRecord[];
  const preferences: PreferenceRecord[] = (preferencesResult.data ?? []) as PreferenceRecord[];
  const visits: VisitRecord[] = (visitsResult.data ?? []) as VisitRecord[];
  const memberships: MembershipRecord[] = (membershipsResult.data ?? []) as MembershipRecord[];
  const registrations: RegistrationRecord[] = (registrationsResult.data ?? []) as RegistrationRecord[];

  const firstError =
    personResult.error ||
    notesResult.error ||
    preferencesResult.error ||
    visitsResult.error ||
    membershipsResult.error ||
    registrationsResult.error;

  const update = updatePerson.bind(null, id);
  const noteAction = addNote.bind(null, id);
  const preferenceAction = addPreference.bind(null, id);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
          Customer profile
        </p>
        <h1 className="mt-2 text-3xl font-semibold">
          {person.preferred_name || person.first_name} {person.last_name || ""}
        </h1>
        <p className="mt-2 text-neutral-600">
          {visits.length} recorded visits · {memberships.length} communities ·{" "}
          {registrations.length} events
        </p>
      </div>

      {(queryError || firstError) && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {queryError || firstError?.message}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Identity</h2>
          <form action={update} className="mt-5 grid gap-3 sm:grid-cols-2">
            <input
              name="first_name"
              required
              defaultValue={person.first_name}
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="last_name"
              defaultValue={person.last_name || ""}
              placeholder="Last name"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="preferred_name"
              defaultValue={person.preferred_name || ""}
              placeholder="Preferred name"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="phone"
              defaultValue={person.phone || ""}
              placeholder="Phone"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="email"
              type="email"
              defaultValue={person.email || ""}
              placeholder="Email"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="occupation"
              defaultValue={person.occupation || ""}
              placeholder="Occupation"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="company"
              defaultValue={person.company || ""}
              placeholder="Company"
              className="rounded-xl border px-3 py-2"
            />
            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Save profile
            </button>
          </form>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Hospitality preferences</h2>
          <form
            action={preferenceAction}
            className="mt-5 grid gap-3 sm:grid-cols-2"
          >
            <input
              name="preference_type"
              required
              placeholder="Type, e.g. seating"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="preference_value"
              required
              placeholder="Preference"
              className="rounded-xl border px-3 py-2"
            />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add preference
            </button>
          </form>

          <div className="mt-5 flex flex-wrap gap-2">
            {preferences.map((item) => (
              <span
                key={item.id}
                className="rounded-full bg-neutral-100 px-3 py-1 text-sm"
              >
                {item.preference_type}: {item.preference_value}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <form action={noteAction} className="mt-5 space-y-3">
            <textarea
              name="note"
              required
              placeholder="Useful hospitality context"
              className="min-h-24 w-full rounded-xl border p-3"
            />
            <select
              name="visibility"
              className="w-full rounded-xl border p-3"
            >
              <option value="barista">Visible to baristas</option>
              <option value="manager">Managers only</option>
              <option value="private">Private</option>
            </select>
            <button className="rounded-xl border px-4 py-2">Add note</button>
          </form>

          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-xl bg-neutral-50 p-4">
                <p>{note.note}</p>
                <p className="mt-2 text-xs text-neutral-500">
                  {note.visibility} ·{" "}
                  {new Date(note.created_at).toLocaleString()}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Relationship timeline</h2>
          <div className="mt-5 space-y-4 text-sm">
            {visits.map((visit) => (
              <div key={visit.id}>
                <p className="font-medium">
                  Visit · {new Date(visit.visited_at).toLocaleDateString()}
                </p>
                <p className="text-neutral-500">
                  {visit.net_amount !== null
                    ? `₹${visit.net_amount}`
                    : visit.source}
                </p>
              </div>
            ))}

            {memberships.map((membership, index) => (
              <div key={`membership-${index}`}>
                <p className="font-medium">
                  Community · {relatedName(membership.communities)}
                </p>
                <p className="text-neutral-500">{membership.role}</p>
              </div>
            ))}

            {registrations.map((registration, index) => (
              <div key={`registration-${index}`}>
                <p className="font-medium">
                  Event · {relatedName(registration.events)}
                </p>
                <p className="text-neutral-500">{registration.status}</p>
              </div>
            ))}

            {!visits.length &&
              !memberships.length &&
              !registrations.length && (
                <p className="text-neutral-500">
                  No timeline activity yet.
                </p>
              )}
          </div>
        </section>
      </div>
    </main>
  );
}
