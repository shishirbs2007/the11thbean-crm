import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Section } from "@/components/customer360/section";
import {
  addHouseholdAddress,
  addHouseholdMember,
  archiveHousehold,
  deleteHouseholdAddress,
  removeHouseholdMember,
  restoreHousehold,
  saveHouseholdPreferences,
  updateHousehold,
} from "../actions";

type Person = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  email: string | null;
};

type HouseholdMember = {
  person_id: string;
  relationship: string | null;
  is_primary: boolean;
  joined_at: string;
  notes: string | null;
  person: Person | Person[] | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayName(person: Pick<
  Person,
  "first_name" | "last_name" | "preferred_name"
>): string {
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

function addressText(address: {
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postal_code: string | null;
}): string {
  return [
    address.address_line_1,
    address.address_line_2,
    address.city,
    address.state,
    address.country,
    address.postal_code,
  ]
    .filter(Boolean)
    .join(", ");
}

export default async function HouseholdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { supabase } = await requireUser();

  const results = await Promise.all([
    supabase.from("households").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("household_members")
      .select(
        `
          person_id,
          relationship,
          is_primary,
          joined_at,
          notes,
          person:people(
            id,
            first_name,
            last_name,
            preferred_name,
            phone,
            email
          )
        `,
      )
      .eq("household_id", id)
      .is("left_at", null)
      .order("is_primary", { ascending: false })
      .order("joined_at", { ascending: true }),
    supabase
      .from("household_addresses")
      .select("*")
      .eq("household_id", id)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("household_preferences")
      .select("*")
      .eq("household_id", id)
      .maybeSingle(),
    supabase
      .from("people")
      .select(
        "id, first_name, last_name, preferred_name, phone, email",
      )
      .eq("is_active", true)
      .order("first_name")
      .limit(1000),
  ]);

  const [
    householdResult,
    membersResult,
    addressesResult,
    preferencesResult,
    peopleResult,
  ] = results;

  const household = householdResult.data;
  if (!household) notFound();

  const members = (membersResult.data ?? []) as HouseholdMember[];
  const addresses = addressesResult.data ?? [];
  const preferences = preferencesResult.data;
  const people = (peopleResult.data ?? []) as Person[];

  const memberIds = new Set(members.map((member) => member.person_id));
  const availablePeople = people.filter(
    (person) => !memberIds.has(person.id),
  );

  const updateAction = updateHousehold.bind(null, id);
  const memberAction = addHouseholdMember.bind(null, id);
  const addressAction = addHouseholdAddress.bind(null, id);
  const preferencesAction = saveHouseholdPreferences.bind(null, id);
  const archiveAction = archiveHousehold.bind(null, id);
  const restoreAction = restoreHousehold.bind(null, id);

  const errors = results
    .map((result) => result.error?.message)
    .filter(Boolean);

  const primaryMember = members.find((member) => member.is_primary);
  const primaryPerson = primaryMember
    ? one(primaryMember.person)
    : people.find((person) => person.id === household.primary_contact_id) ??
      null;

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Link
            href="/households"
            className="text-sm text-neutral-500 hover:text-black"
          >
            Back to households
          </Link>

          <p className="mt-5 text-sm uppercase tracking-[0.18em] text-neutral-500">
            Household 360
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            {household.household_name || "Unnamed household"}
          </h1>

          <p className="mt-2 text-neutral-600">
            {members.length} {members.length === 1 ? "member" : "members"}
            {primaryPerson
              ? ` · Primary contact: ${displayName(primaryPerson)}`
              : ""}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="rounded-2xl border px-5 py-3 text-sm capitalize">
            {household.household_type || "family"}
          </span>

          {household.is_active ? (
            <form action={archiveAction}>
              <button className="rounded-2xl border border-red-300 px-5 py-3 text-sm text-red-700">
                Archive
              </button>
            </form>
          ) : (
            <form action={restoreAction}>
              <button className="rounded-2xl border px-5 py-3 text-sm">
                Restore
              </button>
            </form>
          )}
        </div>
      </div>

      {(query.error || errors.length > 0) && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {query.error || errors.join(" | ")}
        </div>
      )}

      {query.success && (
        <div className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          {query.success}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section title="Household details">
          <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="household_name"
              required
              defaultValue={household.household_name || ""}
              placeholder="Household name"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />

            <select
              name="household_type"
              defaultValue={household.household_type || "family"}
              className="rounded-xl border px-3 py-2"
            >
              <option value="family">Family</option>
              <option value="couple">Couple</option>
              <option value="friends">Friends</option>
              <option value="colleagues">Colleagues</option>
              <option value="organisation">Organisation</option>
              <option value="other">Other</option>
            </select>

            <select
              name="primary_contact_id"
              defaultValue={household.primary_contact_id || ""}
              className="rounded-xl border px-3 py-2"
            >
              <option value="">No primary contact</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                </option>
              ))}
            </select>

            <input
              name="address"
              defaultValue={household.address || ""}
              placeholder="Address"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />

            <input
              name="city"
              defaultValue={household.city || ""}
              placeholder="City"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="state"
              defaultValue={household.state || ""}
              placeholder="State"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="country"
              defaultValue={household.country || "India"}
              placeholder="Country"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="postal_code"
              defaultValue={household.postal_code || ""}
              placeholder="Postal code"
              className="rounded-xl border px-3 py-2"
            />

            <textarea
              name="notes"
              defaultValue={household.notes || ""}
              placeholder="Household notes"
              className="min-h-24 rounded-xl border p-3 sm:col-span-2"
            />

            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Save household
            </button>
          </form>
        </Section>

        <Section
          title="Members"
          description="People who visit, celebrate or make decisions together."
        >
          <form action={memberAction} className="grid gap-3 sm:grid-cols-2">
            <select
              name="person_id"
              required
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Choose customer</option>
              {availablePeople.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                </option>
              ))}
            </select>

            <input
              name="relationship"
              placeholder="Relationship"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="notes"
              placeholder="Member notes"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input name="is_primary" type="checkbox" />
              Set as primary contact
            </label>

            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add member
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {members.length === 0 ? (
              <p className="text-sm text-neutral-500">No members yet.</p>
            ) : (
              members.map((member) => {
                const person = one(member.person);

                if (!person) return null;

                const removeAction = removeHouseholdMember.bind(
                  null,
                  id,
                  member.person_id,
                );

                return (
                  <article
                    key={member.person_id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-neutral-50 p-4"
                  >
                    <div>
                      <Link
                        href={`/customers/${person.id}`}
                        className="font-medium hover:underline"
                      >
                        {displayName(person)}
                      </Link>

                      <p className="mt-1 text-sm text-neutral-600">
                        {member.relationship || "Household member"}
                        {member.is_primary ? " · Primary contact" : ""}
                      </p>

                      <p className="mt-1 text-sm text-neutral-500">
                        {[person.phone, person.email]
                          .filter(Boolean)
                          .join(" · ") || "No contact details"}
                      </p>

                      {member.notes && (
                        <p className="mt-2 text-sm text-neutral-500">
                          {member.notes}
                        </p>
                      )}
                    </div>

                    <form action={removeAction}>
                      <button className="rounded-xl border px-3 py-2 text-sm">
                        Remove
                      </button>
                    </form>
                  </article>
                );
              })
            )}
          </div>
        </Section>

        <Section title="Hospitality preferences">
          <form action={preferencesAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="favourite_table"
              defaultValue={preferences?.favourite_table || ""}
              placeholder="Favourite table"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="favourite_area"
              defaultValue={preferences?.favourite_area || ""}
              placeholder="Favourite area"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="preferred_visit_time"
              defaultValue={preferences?.preferred_visit_time || ""}
              placeholder="Preferred visit time"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="preferred_temperature"
              defaultValue={preferences?.preferred_temperature || ""}
              placeholder="Temperature preference"
              className="rounded-xl border px-3 py-2"
            />

            <textarea
              name="seating_notes"
              defaultValue={preferences?.seating_notes || ""}
              placeholder="Seating notes"
              className="min-h-20 rounded-xl border p-3 sm:col-span-2"
            />

            <textarea
              name="dietary_notes"
              defaultValue={preferences?.dietary_notes || ""}
              placeholder="Dietary notes"
              className="min-h-20 rounded-xl border p-3 sm:col-span-2"
            />

            <textarea
              name="allergies"
              defaultValue={preferences?.allergies || ""}
              placeholder="Allergies"
              className="min-h-20 rounded-xl border p-3 sm:col-span-2"
            />

            <textarea
              name="music_preferences"
              defaultValue={preferences?.music_preferences || ""}
              placeholder="Music preferences"
              className="min-h-20 rounded-xl border p-3"
            />

            <textarea
              name="lighting_preferences"
              defaultValue={preferences?.lighting_preferences || ""}
              placeholder="Lighting preferences"
              className="min-h-20 rounded-xl border p-3"
            />

            <textarea
              name="celebration_notes"
              defaultValue={preferences?.celebration_notes || ""}
              placeholder="Celebration and occasion notes"
              className="min-h-24 rounded-xl border p-3 sm:col-span-2"
            />

            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Save household preferences
            </button>
          </form>
        </Section>

        <Section title="Addresses">
          <form action={addressAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="label"
              defaultValue="Home"
              placeholder="Label"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="postal_code"
              placeholder="Postal code"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="address_line_1"
              placeholder="Address line 1"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />

            <input
              name="address_line_2"
              placeholder="Address line 2"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />

            <input
              name="city"
              defaultValue={household.city || "Bengaluru"}
              placeholder="City"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="state"
              defaultValue={household.state || "Karnataka"}
              placeholder="State"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="country"
              defaultValue={household.country || "India"}
              placeholder="Country"
              className="rounded-xl border px-3 py-2"
            />

            <label className="flex items-center gap-2 text-sm">
              <input name="is_primary" type="checkbox" />
              Primary address
            </label>

            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add address
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {addresses.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No structured addresses yet.
              </p>
            ) : (
              addresses.map((address) => {
                const deleteAction = deleteHouseholdAddress.bind(
                  null,
                  id,
                  address.id,
                );

                return (
                  <article
                    key={address.id}
                    className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-neutral-50 p-4"
                  >
                    <div>
                      <p className="font-medium">
                        {address.label || "Address"}
                        {address.is_primary ? " · Primary" : ""}
                      </p>

                      <p className="mt-1 text-sm text-neutral-600">
                        {addressText(address) || "No address details"}
                      </p>
                    </div>

                    <form action={deleteAction}>
                      <button className="rounded-xl border px-3 py-2 text-sm">
                        Remove
                      </button>
                    </form>
                  </article>
                );
              })
            )}
          </div>
        </Section>
      </div>
    </main>
  );
}
