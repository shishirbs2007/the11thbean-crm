import { notFound } from "next/navigation";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  attendanceRate,
  capacityLabel,
  capacityState,
  placesRemaining,
  postEventActions,
  type AttendanceSummary,
} from "@/lib/intelligence/events";
import {
  inviteToEvent,
  markAttendance,
  registerForEvent,
  updateEvent,
} from "./actions";

type PersonName = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
};

type Registration = {
  person_id: string;
  status: string;
  guest_count: number;
  notes: string | null;
  attended_at: string | null;
  people: PersonName | PersonName[] | null;
};

type Candidate = {
  person_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  score: number;
  reasons: string[];
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayName(
  person: Pick<
    PersonName,
    "first_name" | "last_name" | "preferred_name"
  > | null,
): string {
  if (!person) return "Unknown";
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

function forDateTimeInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { id } = await params;
  const { error: queryError, success } = await searchParams;
  const { supabase } = await requireUser();

  const [
    eventResult,
    summaryResult,
    registrationsResult,
    candidatesResult,
    communitiesResult,
    peopleResult,
  ] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("event_attendance_summary")
      .select("*")
      .eq("event_id", id)
      .maybeSingle(),
    supabase
      .from("event_registrations")
      .select(
        "person_id, status, guest_count, notes, attended_at, people(id, first_name, last_name, preferred_name)",
      )
      .eq("event_id", id),
    supabase.rpc("event_invitation_candidates", {
      target_event_id: id,
      max_results: 12,
    }),
    supabase
      .from("communities")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name")
      .eq("is_active", true)
      .order("first_name")
      .limit(500),
  ]);

  const event = eventResult.data;
  if (!event) notFound();

  const summary: AttendanceSummary = summaryResult.data ?? {
    registered_count: 0,
    expected_headcount: 0,
    attended_count: 0,
    no_show_count: 0,
    interested_count: 0,
    capacity_used_percent: null,
  };

  const registrations = (registrationsResult.data ?? []) as Registration[];
  const candidates = (candidatesResult.data ?? []) as Candidate[];
  const communities = communitiesResult.data ?? [];
  const people = (peopleResult.data ?? []) as PersonName[];

  const state = capacityState(summary.expected_headcount, event.capacity);
  const remaining = placesRemaining(summary.expected_headcount, event.capacity);
  const turnout = attendanceRate(summary);
  const hasHappened = new Date(event.starts_at) < new Date();

  const followUps = postEventActions(
    registrations.map((registration) => ({
      personId: registration.person_id,
      name: displayName(one(registration.people)),
      status: registration.status,
    })),
  );

  const errors = [
    queryError,
    eventResult.error?.message,
    summaryResult.error?.message,
    registrationsResult.error?.message,
    candidatesResult.error?.message,
  ].filter(Boolean);

  const update = updateEvent.bind(null, id);
  const invite = inviteToEvent.bind(null, id);
  const register = registerForEvent.bind(null, id);
  const attendance = markAttendance.bind(null, id);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Event"
        title={event.name}
        description={`${new Date(event.starts_at).toLocaleString()} · ${
          event.location || "Location pending"
        }`}
      />

      {success && (
        <p className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-green-800">
          {success}
        </p>
      )}

      {errors.length > 0 && (
        <p className="mt-4 rounded-xl border border-red-300 p-3 text-red-700">
          {errors.join(" | ")}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Registered", `${summary.registered_count}`],
          [
            "Expected headcount",
            event.capacity
              ? `${summary.expected_headcount} of ${event.capacity}`
              : `${summary.expected_headcount}`,
          ],
          [
            "Capacity",
            remaining === null
              ? capacityLabel(state)
              : `${capacityLabel(state)} · ${remaining} left`,
          ],
          [
            "Turnout",
            turnout === null ? "Not marked off yet" : `${turnout}%`,
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
          title="Who to invite"
          description="Ranked by who belongs to the hosting community, who has come to events like this, and who is a live regular."
        >
          {candidates.length === 0 ? (
            <p className="text-neutral-600">
              No suggestions yet. Link this event to a community, or record a
              few visits, and the CRM will start recognising who to ask.
            </p>
          ) : (
            <ul className="space-y-3">
              {candidates.map((candidate) => (
                <li
                  key={candidate.person_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 p-4"
                >
                  <div>
                    <Link
                      href={`/customers/${candidate.person_id}`}
                      className="font-semibold underline"
                    >
                      {displayName(candidate)}
                    </Link>
                    <p className="mt-1 text-sm text-neutral-600">
                      {candidate.reasons.join(" · ") || "Known to the café"}
                    </p>
                  </div>
                  <form action={invite}>
                    <input
                      type="hidden"
                      name="person_id"
                      value={candidate.person_id}
                    />
                    <SubmitButton
                      pendingText="Inviting..."
                      className="rounded-xl border px-4 py-2 text-sm"
                    >
                      Invite
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Register someone"
          description="Add a guest directly, with however many people they are bringing."
        >
          <form action={register} className="grid gap-3">
            <select
              name="person_id"
              required
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Choose a customer</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                </option>
              ))}
            </select>
            <input
              name="guest_count"
              type="number"
              min="1"
              defaultValue="1"
              placeholder="Guests"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="notes"
              placeholder="Anything the host should know"
              className="rounded-xl border px-3 py-2"
            />
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white">
              Register
            </SubmitButton>
          </form>
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Guest list"
          description="Mark people off as they arrive. Attendance lands on their timeline."
        >
          {registrations.length === 0 ? (
            <p className="text-neutral-600">Nobody registered yet.</p>
          ) : (
            <ul className="space-y-3">
              {registrations.map((registration) => {
                const person = one(registration.people);

                return (
                  <li
                    key={registration.person_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                  >
                    <div>
                      <Link
                        href={`/customers/${registration.person_id}`}
                        className="font-semibold underline"
                      >
                        {displayName(person)}
                      </Link>
                      <p className="mt-1 text-sm text-neutral-600">
                        {registration.status}
                        {registration.guest_count > 1 &&
                          ` · ${registration.guest_count} people`}
                        {registration.notes && ` · ${registration.notes}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {[
                        ["true", "Came"],
                        ["false", "Did not come"],
                      ].map(([didAttend, label]) => (
                        <form key={label} action={attendance}>
                          <input
                            type="hidden"
                            name="person_id"
                            value={registration.person_id}
                          />
                          <input
                            type="hidden"
                            name="did_attend"
                            value={didAttend}
                          />
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
              })}
            </ul>
          )}
        </Section>
      </div>

      {hasHappened && followUps.length > 0 && (
        <div className="mt-8">
          <Section
            title="After the event"
            description="Small acts of hospitality that turn an event into a relationship."
          >
            <ol className="space-y-3">
              {followUps.map((followUp) => (
                <li
                  key={`${followUp.personId}-${followUp.action}`}
                  className="rounded-xl bg-neutral-50 p-4"
                >
                  {followUp.action}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      )}

      <div className="mt-8">
        <Section
          title="Event details"
          description="Linking an event to a community is what lets the CRM suggest who to invite."
        >
          <form action={update} className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              defaultValue={event.name}
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="starts_at"
              type="datetime-local"
              defaultValue={forDateTimeInput(event.starts_at)}
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="location"
              defaultValue={event.location || ""}
              placeholder="Location"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="capacity"
              type="number"
              min="1"
              defaultValue={event.capacity ?? ""}
              placeholder="Capacity"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="event_type"
              defaultValue={event.event_type || "general"}
              placeholder="Event type, e.g. badminton"
              className="rounded-xl border px-3 py-2"
            />
            <select
              name="community_id"
              defaultValue={event.community_id || ""}
              className="rounded-xl border px-3 py-2"
            >
              <option value="">No hosting community</option>
              {communities.map((community) => (
                <option key={community.id} value={community.id}>
                  {community.name}
                </option>
              ))}
            </select>
            <textarea
              name="description"
              defaultValue={event.description || ""}
              placeholder="Description"
              className="min-h-24 rounded-xl border p-3 sm:col-span-2"
            />
            <textarea
              name="host_notes"
              defaultValue={event.host_notes || ""}
              placeholder="Notes for whoever is hosting on the day"
              className="min-h-24 rounded-xl border p-3 sm:col-span-2"
            />
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Save event
            </SubmitButton>
          </form>
        </Section>
      </div>
    </main>
  );
}
