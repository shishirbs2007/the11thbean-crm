import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { parseHospitalityScore, topSignals } from "@/lib/intelligence/briefing";
import { parseNextBestAction } from "@/lib/intelligence/recommendations";
import {
  buildHospitalitySuggestions,
  parseTasteProfile,
  upcomingImportantDates,
  usualDrink,
  usualFood,
  type HospitalitySignals,
} from "@/lib/intelligence/hospitality";
import { addNote, addPreference, updatePerson } from "../actions";
import {
  addImportantDate,
  addMilestone,
  addPet,
  addReferral,
  addRelationship,
  saveHospitalityProfile,
} from "./customer360-actions";

type JsonObject = Record<string, unknown>;
type PersonName = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function displayName(person: PersonName | null): string {
  if (!person) return "Unknown";
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

function jsonString(value: JsonObject, key: string): string {
  const item = value[key];
  return typeof item === "string" ? item : "";
}

function jsonList(value: JsonObject, key: string): string {
  const item = value[key];
  return Array.isArray(item) ? item.join(", ") : "";
}

function numberValue(value: unknown): number {
  return Number(value ?? 0);
}

function weekdayName(value: string | null | undefined): string {
  const names = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const index = Number(value);

  return Number.isInteger(index) && index >= 0 && index <= 6
    ? names[index]
    : "Not enough data";
}

function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;

  return Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
}

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const results = await Promise.all([
    supabase.from("people").select("*").eq("id", id).single(),
    supabase
      .from("customer_notes")
      .select("*")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("customer_preferences")
      .select("*")
      .eq("person_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("visits")
      .select("*")
      .eq("person_id", id)
      .order("visited_at", { ascending: false })
      .limit(50),
    supabase
      .from("community_memberships")
      .select("role, joined_at, communities(name)")
      .eq("person_id", id),
    supabase
      .from("event_registrations")
      .select("status, registered_at, events(name, starts_at)")
      .eq("person_id", id),
    supabase
      .from("customer_hospitality_profiles")
      .select("*")
      .eq("person_id", id)
      .maybeSingle(),
    supabase.from("pets").select("*").eq("person_id", id).eq("is_active", true),
    supabase
      .from("important_dates")
      .select("*")
      .eq("person_id", id)
      .order("date_value"),
    supabase
      .from("person_relationships")
      .select(
        "id, relationship_type, notes, related_person:people!person_relationships_related_person_id_fkey(id, first_name, last_name, preferred_name)",
      )
      .eq("person_id", id),
    supabase
      .from("referrals")
      .select(
        "id, referred_at, source_context, referred_person:people!referrals_referred_person_id_fkey(id, first_name, last_name, preferred_name)",
      )
      .eq("referrer_person_id", id),
    supabase
      .from("customer_milestones")
      .select("*")
      .eq("person_id", id)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("timeline_entries")
      .select("*")
      .eq("person_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("loyalty_accounts")
      .select("*")
      .eq("person_id", id)
      .maybeSingle(),
    supabase
      .from("customer_health")
      .select("*")
      .eq("person_id", id)
      .maybeSingle(),
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name")
      .neq("id", id)
      .eq("is_active", true)
      .order("first_name")
      .limit(500),
    supabase.rpc("customer_taste_profile", { target_person_id: id }),
    supabase.rpc("hospitality_score", { target_person_id: id }),
    supabase.rpc("next_best_action", { target_person_id: id }),
  ]);

  const [
    personResult,
    notesResult,
    preferencesResult,
    visitsResult,
    membershipsResult,
    registrationsResult,
    hospitalityResult,
    petsResult,
    datesResult,
    relationshipsResult,
    referralsResult,
    milestonesResult,
    timelineResult,
    loyaltyResult,
    healthResult,
    optionsResult,
    tasteResult,
    scoreResult,
    nextActionResult,
  ] = results;

  const person = personResult.data;
  if (!person) notFound();

  const notes = notesResult.data ?? [];
  const preferences = preferencesResult.data ?? [];
  const visits = visitsResult.data ?? [];
  const memberships = membershipsResult.data ?? [];
  const registrations = registrationsResult.data ?? [];
  const hospitality = hospitalityResult.data;
  const pets = petsResult.data ?? [];
  const dates = datesResult.data ?? [];
  const relationships = relationshipsResult.data ?? [];
  const referrals = referralsResult.data ?? [];
  const milestones = milestonesResult.data ?? [];
  const timeline = timelineResult.data ?? [];
  const loyalty = loyaltyResult.data;
  const health = healthResult.data;
  const options = (optionsResult.data ?? []) as PersonName[];

  const errors = results.map((result) => result.error).filter(Boolean);

  const update = updatePerson.bind(null, id);
  const noteAction = addNote.bind(null, id);
  const preferenceAction = addPreference.bind(null, id);
  const hospitalityAction = saveHospitalityProfile.bind(null, id);
  const petAction = addPet.bind(null, id);
  const dateAction = addImportantDate.bind(null, id);
  const relationshipAction = addRelationship.bind(null, id);
  const referralAction = addReferral.bind(null, id);
  const milestoneAction = addMilestone.bind(null, id);

  const spend = visits.reduce(
    (total, visit) => total + Number(visit.net_amount ?? 0),
    0,
  );

  const coffee = (hospitality?.coffee_preferences ?? {}) as JsonObject;
  const food = (hospitality?.food_preferences ?? {}) as JsonObject;

  const relationshipScore = numberValue(health?.relationship_score);
  const lastVisitDays = daysSince(health?.last_visit_at);
  const taste = parseTasteProfile(tasteResult.data);
  const hospitality_score = parseHospitalityScore(scoreResult.data);
  const nextAction = parseNextBestAction(nextActionResult.data);

  const signals: HospitalitySignals = {
    taste,
    statedDrink: jsonString(coffee, "drink"),
    allergies: hospitality?.allergies ?? [],
    seatingPreference:
      preferences.find((preference) => preference.preference_type === "seating")
        ?.preference_value ?? "",
    daysSinceLastVisit: lastVisitDays,
    referralCount: referrals.length,
    communityNames: memberships.flatMap(
      (membership) => one(membership.communities)?.name ?? [],
    ),
    upcomingDates: upcomingImportantDates(dates),
  };

  const suggestions = buildHospitalitySuggestions(signals);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
            Customer 360
          </p>
          <h1 className="mt-2 text-3xl font-semibold">
            {person.preferred_name || person.first_name}{" "}
            {person.last_name || ""}
          </h1>
          <p className="mt-2 text-neutral-600">
            {visits.length} visits · ₹{spend.toFixed(0)} recorded spend ·{" "}
            {memberships.length} communities · {registrations.length} events
          </p>
        </div>
        <div className="rounded-2xl border px-5 py-3 text-sm">
          Loyalty: {loyalty?.tier || "Not enrolled"} ·{" "}
          {Number(loyalty?.points_balance ?? 0)} points
        </div>
      </div>

      <ErrorPanel
        messages={[errors.map((error) => error?.message).join(" | ")]}
      />

      <Section
        title="Next best action"
        description="The single most useful thing to do for this guest right now, and why the CRM thinks so."
      >
        <div className="rounded-xl bg-neutral-50 p-5">
          <p className="text-sm uppercase tracking-wide text-neutral-500">
            {nextAction.label}
          </p>
          <p className="mt-2 text-lg font-semibold">
            {nextAction.suggested_action}
          </p>
          <p className="mt-2 text-sm text-neutral-600">{nextAction.why}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Confidence {Math.round(nextAction.confidence * 100)}%
          </p>
        </div>

        {hospitality_score.signals.length > 0 && (
          <div className="mt-5">
            <p className="text-sm text-neutral-500">
              Hospitality score {Math.round(hospitality_score.score)}/100,
              driven by:
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {topSignals(hospitality_score).map((signal) => (
                <li
                  key={signal.key}
                  className="rounded-full border px-3 py-1 text-sm"
                >
                  {signal.label} {Math.round(signal.strength)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      <Section
        title="Customer health"
        description="Automatically calculated from recency, frequency, spend and relationship activity."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [
              "Health score",
              `${numberValue(health?.health_score).toFixed(0)}/100`,
            ],
            ["Relationship score", `${relationshipScore.toFixed(0)}/100`],
            ["Churn risk", `${numberValue(health?.churn_risk).toFixed(0)}%`],
            [
              "Lifetime value",
              `₹${numberValue(health?.lifetime_value || spend).toFixed(0)}`,
            ],
            [
              "Average ticket",
              `₹${numberValue(health?.average_ticket).toFixed(0)}`,
            ],
            ["Favourite day", weekdayName(health?.preferred_visit_day)],
            [
              "Favourite time",
              health?.preferred_visit_time || "Not enough data",
            ],
            [
              "Last visit",
              lastVisitDays === null
                ? "No visit recorded"
                : `${lastVisitDays} day${lastVisitDays === 1 ? "" : "s"} ago`,
            ],
            [
              "Community engagement",
              `${numberValue(health?.community_score).toFixed(0)}/100`,
            ],
            [
              "Referral impact",
              `${numberValue(health?.referral_count).toFixed(0)} introduced · ₹${numberValue(
                health?.referred_revenue,
              ).toFixed(0)}`,
            ],
            ["Usual drink", usualDrink(signals) || "Not enough data"],
            ["Usual food", usualFood(signals) || "Not enough data"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border p-5">
              <p className="text-sm text-neutral-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Hospitality suggestions"
          description="Immediate actions based on the guest's live CRM history."
        >
          <ol className="space-y-3">
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                className="flex gap-3 rounded-xl bg-neutral-50 p-4"
              >
                <span className="font-semibold">{index + 1}.</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Identity and contact">
          <form action={update} className="grid gap-3 sm:grid-cols-2">
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
              Save identity
            </button>
          </form>
        </Section>

        <Section
          title="Barista briefing"
          description="The five-second picture before serving the guest."
        >
          <form action={hospitalityAction} className="space-y-3">
            <textarea
              name="staff_summary"
              defaultValue={hospitality?.staff_summary || ""}
              placeholder="Example: Thursday evening regular after badminton. Usually wants a flat white and quiet seating."
              className="min-h-28 w-full rounded-xl border p-3"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="preferred_table"
                defaultValue={hospitality?.preferred_table || ""}
                placeholder="Preferred table"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="preferred_zone"
                defaultValue={hospitality?.preferred_zone || ""}
                placeholder="Preferred zone"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="preferred_visit_time"
                defaultValue={hospitality?.preferred_visit_time || ""}
                placeholder="Usual visit time"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="typical_visit_context"
                defaultValue={hospitality?.typical_visit_context || ""}
                placeholder="Typical visit context"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="coffee_drink"
                defaultValue={jsonString(coffee, "drink")}
                placeholder="Favourite coffee"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="coffee_milk"
                defaultValue={jsonString(coffee, "milk")}
                placeholder="Milk preference"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="coffee_strength"
                defaultValue={jsonString(coffee, "strength")}
                placeholder="Strength"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="coffee_sweetness"
                defaultValue={jsonString(coffee, "sweetness")}
                placeholder="Sweetness"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="food_favourites"
                defaultValue={jsonList(food, "favourites")}
                placeholder="Food favourites, comma-separated"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="food_dislikes"
                defaultValue={jsonList(food, "dislikes")}
                placeholder="Food dislikes, comma-separated"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="dietary_restrictions"
                defaultValue={(hospitality?.dietary_restrictions || []).join(
                  ", ",
                )}
                placeholder="Dietary restrictions"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="allergies"
                defaultValue={(hospitality?.allergies || []).join(", ")}
                placeholder="Allergies"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="languages"
                defaultValue={(hospitality?.languages || []).join(", ")}
                placeholder="Languages"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="work_style"
                defaultValue={hospitality?.work_style || ""}
                placeholder="Work or visit style"
                className="rounded-xl border px-3 py-2"
              />
            </div>
            <textarea
              name="children_notes"
              defaultValue={hospitality?.children_notes || ""}
              placeholder="Children and family context"
              className="min-h-20 w-full rounded-xl border p-3"
            />
            <textarea
              name="accessibility_needs"
              defaultValue={hospitality?.accessibility_needs || ""}
              placeholder="Accessibility needs"
              className="min-h-20 w-full rounded-xl border p-3"
            />
            <textarea
              name="conversation_preferences"
              defaultValue={hospitality?.conversation_preferences || ""}
              placeholder="Conversation preferences"
              className="min-h-20 w-full rounded-xl border p-3"
            />
            <textarea
              name="do_not_mention"
              defaultValue={hospitality?.do_not_mention || ""}
              placeholder="Sensitive topics staff should avoid"
              className="min-h-20 w-full rounded-xl border p-3"
            />
            <button className="rounded-xl bg-black px-4 py-2 text-white">
              Save hospitality profile
            </button>
          </form>
        </Section>

        <Section title="Relationships">
          <form
            action={relationshipAction}
            className="grid gap-3 sm:grid-cols-2"
          >
            <select
              aria-label="Choose a related person"
              name="related_person_id"
              required
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Choose related customer</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {displayName(option)}
                </option>
              ))}
            </select>
            <input
              name="relationship_type"
              required
              placeholder="Relationship, e.g. spouse"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="notes"
              placeholder="Notes"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add relationship
            </button>
          </form>
          <div className="mt-5 space-y-2">
            {relationships.map((relationship) => {
              const related = one(
                relationship.related_person as PersonName | PersonName[] | null,
              );
              return (
                <div
                  key={relationship.id}
                  className="rounded-xl bg-neutral-50 p-3 text-sm"
                >
                  {displayName(related)} · {relationship.relationship_type}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Pets">
          <form action={petAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Pet name"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="species"
              placeholder="Species"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="breed"
              placeholder="Breed"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="temperament"
              placeholder="Temperament"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="notes"
              placeholder="Useful notes"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add pet
            </button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            {pets.map((pet) => (
              <span
                key={pet.id}
                className="rounded-full bg-neutral-100 px-3 py-1 text-sm"
              >
                {pet.name}
                {pet.species ? ` · ${pet.species}` : ""}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Important dates">
          <form action={dateAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="date_type"
              required
              placeholder="Birthday, anniversary..."
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="date_value"
              required
              type="date"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="label"
              placeholder="Label"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="notes"
              placeholder="Notes"
              className="rounded-xl border px-3 py-2"
            />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add date
            </button>
          </form>
          <div className="mt-5 space-y-2 text-sm">
            {dates.map((date) => (
              <div key={date.id}>
                {date.date_type}:{" "}
                {new Date(`${date.date_value}T00:00:00`).toLocaleDateString()}
                {date.label ? ` · ${date.label}` : ""}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Referrals">
          <form action={referralAction} className="grid gap-3 sm:grid-cols-2">
            <select
              aria-label="Choose the person they referred"
              name="referred_person_id"
              required
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Customer introduced by this person</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {displayName(option)}
                </option>
              ))}
            </select>
            <input
              name="source_context"
              placeholder="Context"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="notes"
              placeholder="Notes"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Record referral
            </button>
          </form>
          <div className="mt-5 space-y-2">
            {referrals.map((referral) => {
              const referred = one(
                referral.referred_person as PersonName | PersonName[] | null,
              );
              return (
                <div
                  key={referral.id}
                  className="rounded-xl bg-neutral-50 p-3 text-sm"
                >
                  Introduced {displayName(referred)}
                  {referral.source_context
                    ? ` · ${referral.source_context}`
                    : ""}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Milestones">
          <form action={milestoneAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="milestone_type"
              placeholder="Milestone type"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="title"
              required
              placeholder="Title"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="occurred_at"
              type="datetime-local"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="description"
              placeholder="Description"
              className="rounded-xl border px-3 py-2"
            />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add milestone
            </button>
          </form>
          <div className="mt-5 space-y-2 text-sm">
            {milestones.map((milestone) => (
              <div key={milestone.id}>
                {milestone.title} ·{" "}
                {new Date(milestone.occurred_at).toLocaleDateString()}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Quick preferences">
          <form action={preferenceAction} className="grid gap-3 sm:grid-cols-2">
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
        </Section>

        <Section title="Staff notes">
          <form action={noteAction} className="space-y-3">
            <textarea
              name="note"
              required
              placeholder="Useful hospitality context"
              className="min-h-24 w-full rounded-xl border p-3"
            />
            <select
              aria-label="Who can see this note"
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
        </Section>

        <Section
          title="Complete relationship timeline"
          description="Visits, notes, milestones and future imported activity."
        >
          <div className="space-y-4">
            {timeline.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No timeline activity yet.
              </p>
            ) : (
              timeline.map((entry) => (
                <article key={entry.id} className="border-l-2 pl-4">
                  <p className="font-medium">{entry.title}</p>
                  {entry.summary && (
                    <p className="mt-1 text-sm text-neutral-600">
                      {entry.summary}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-neutral-500">
                    {entry.event_type} ·{" "}
                    {new Date(entry.occurred_at).toLocaleString()}
                  </p>
                </article>
              ))
            )}
          </div>
        </Section>

        <Section title="Communities and events">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="font-medium">Communities</h3>
              <div className="mt-3 space-y-2 text-sm">
                {memberships.map((membership, index) => {
                  const community = one(
                    membership.communities as
                      { name: string } | { name: string }[] | null,
                  );
                  return (
                    <div key={`community-${index}`}>
                      {community?.name || "Unknown"} · {membership.role}
                    </div>
                  );
                })}
                {memberships.length === 0 && (
                  <p className="text-neutral-500">None yet.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-medium">Events</h3>
              <div className="mt-3 space-y-2 text-sm">
                {registrations.map((registration, index) => {
                  const event = one(
                    registration.events as
                      | { name: string; starts_at: string }
                      | { name: string; starts_at: string }[]
                      | null,
                  );
                  return (
                    <div key={`event-${index}`}>
                      {event?.name || "Unknown"} · {registration.status}
                    </div>
                  );
                })}
                {registrations.length === 0 && (
                  <p className="text-neutral-500">None yet.</p>
                )}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </main>
  );
}
