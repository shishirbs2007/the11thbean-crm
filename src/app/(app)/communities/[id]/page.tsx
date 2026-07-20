import Link from "next/link";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  communityStatus,
  type CommunityHealthRow,
} from "@/lib/intelligence/events";
import { joinCommunity, leaveCommunity, updateCommunity } from "./actions";

type PersonName = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
};

type Membership = {
  person_id: string;
  role: string;
  joined_at: string | null;
  left_at: string | null;
  people: PersonName | PersonName[] | null;
};

type CommunityEvent = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayName(
  person: Pick<PersonName, "first_name" | "last_name" | "preferred_name"> | null,
): string {
  if (!person) return "Unknown";
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

export default async function CommunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const nowIso = new Date().toISOString();

  const [
    communityResult,
    healthResult,
    membershipsResult,
    upcomingResult,
    pastResult,
    peopleResult,
  ] = await Promise.all([
    supabase.from("communities").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("community_health")
      .select("*")
      .eq("community_id", id)
      .maybeSingle(),
    supabase
      .from("community_memberships")
      .select(
        "person_id, role, joined_at, left_at, people(id, first_name, last_name, preferred_name)",
      )
      .eq("community_id", id),
    supabase
      .from("events")
      .select("id, name, starts_at, location")
      .eq("community_id", id)
      .gte("starts_at", nowIso)
      .order("starts_at")
      .limit(25),
    supabase
      .from("events")
      .select("id, name, starts_at, location")
      .eq("community_id", id)
      .lt("starts_at", nowIso)
      .order("starts_at", { ascending: false })
      .limit(25),
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name")
      .eq("is_active", true)
      .order("first_name")
      .limit(500),
  ]);

  const community = communityResult.data;
  if (!community) notFound();

  const health = healthResult.data as
    | (CommunityHealthRow & { community_id: string })
    | null;
  const memberships = (membershipsResult.data ?? []) as Membership[];
  const upcoming = (upcomingResult.data ?? []) as CommunityEvent[];
  const past = (pastResult.data ?? []) as CommunityEvent[];
  const events = [...upcoming, ...past];
  const people = (peopleResult.data ?? []) as PersonName[];

  const active = memberships.filter((member) => !member.left_at);
  const former = memberships.filter((member) => member.left_at);
  const memberIds = new Set(active.map((member) => member.person_id));
  const status = health ? communityStatus(health) : null;

  const update = updateCommunity.bind(null, id);
  const join = joinCommunity.bind(null, id);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Community"
        title={community.name}
        description={community.description || "No description yet."}
      />

      <ErrorPanel
        messages={[
          communityResult.error?.message,
          membershipsResult.error?.message,
          upcomingResult.error?.message,
          pastResult.error?.message,
        ]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Active members", `${health?.active_members ?? active.length}`],
          [
            "Joined this quarter",
            `${health?.joined_last_quarter ?? 0}`,
          ],
          ["Events this quarter", `${health?.events_last_quarter ?? 0}`],
          ["Status", status?.label ?? "Not enough data"],
        ].map(([label, text]) => (
          <div key={label} className="rounded-2xl border p-5">
            <p className="text-sm text-neutral-500">{label}</p>
            <p
              className={
                label === "Status" && status?.needsAttention
                  ? "mt-2 text-2xl font-semibold text-amber-700"
                  : "mt-2 text-2xl font-semibold"
              }
            >
              {text}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Members"
          description="The single place community membership is managed."
        >
          <form action={join} className="grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
            <select
              name="person_id"
              required
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Add someone</option>
              {people
                .filter((person) => !memberIds.has(person.id))
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {displayName(person)}
                  </option>
                ))}
            </select>
            <input
              name="role"
              placeholder="Role"
              defaultValue="member"
              className="rounded-xl border px-3 py-2"
            />
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white">
              Add
            </SubmitButton>
          </form>

          {active.length === 0 ? (
            <p className="mt-5 text-neutral-600">Nobody has joined yet.</p>
          ) : (
            <ul className="mt-5 space-y-2">
              {active.map((member) => {
                const leave = leaveCommunity.bind(null, id, member.person_id);

                return (
                  <li
                    key={member.person_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                  >
                    <div>
                      <Link
                        href={`/customers/${member.person_id}`}
                        className="font-medium underline"
                      >
                        {displayName(one(member.people))}
                      </Link>
                      <p className="text-sm text-neutral-500">
                        {member.role}
                        {member.joined_at && ` · joined ${member.joined_at}`}
                      </p>
                    </div>
                    <form action={leave}>
                      <SubmitButton
                        pendingText="Saving..."
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        Mark as left
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}

          {former.length > 0 && (
            <p className="mt-4 text-sm text-neutral-500">
              {former.length} former member{former.length === 1 ? "" : "s"}:{" "}
              {former
                .map((member) => displayName(one(member.people)))
                .join(", ")}
            </p>
          )}
        </Section>

        <Section
          title="Events"
          description="What this community has met for, and what is coming."
        >
          {events.length === 0 ? (
            <p className="text-neutral-600">
              No events yet. Create one and set its hosting community to this
              group, and the CRM will suggest who to invite.
            </p>
          ) : (
            <>
              {upcoming.length > 0 && (
                <>
                  <h3 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
                    Coming up
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {upcoming.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </ul>
                </>
              )}

              {past.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-medium uppercase tracking-wide text-neutral-500">
                    Already happened
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {past.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Details and notes"
          description="How the group works, and anything staff should remember about it."
        >
          <form action={update} className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              defaultValue={community.name}
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="category"
              defaultValue={community.category || ""}
              placeholder="Category, e.g. sport"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="meeting_frequency"
              defaultValue={community.meeting_frequency || ""}
              placeholder="Meets, e.g. every Thursday"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />
            <textarea
              name="description"
              defaultValue={community.description || ""}
              placeholder="Description"
              className="min-h-24 rounded-xl border p-3 sm:col-span-2"
            />
            <textarea
              name="notes"
              defaultValue={community.notes || ""}
              placeholder="Notes for staff"
              className="min-h-24 rounded-xl border p-3 sm:col-span-2"
            />
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Save community
            </SubmitButton>
          </form>
        </Section>
      </div>
    </main>
  );
}

function EventRow({ event }: { event: CommunityEvent }) {
  return (
    <li className="rounded-xl border p-3">
      <Link href={`/events/${event.id}`} className="font-medium underline">
        {event.name}
      </Link>
      <p className="text-sm text-neutral-500">
        {new Date(event.starts_at).toLocaleString()}
        {event.location && ` · ${event.location}`}
      </p>
    </li>
  );
}
