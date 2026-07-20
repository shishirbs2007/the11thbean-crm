import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { createHousehold } from "./actions";

type SearchParams = {
  q?: string;
  status?: string;
  page?: string;
  error?: string;
  success?: string;
};

type PersonOption = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
};

function displayName(person: PersonOption): string {
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

function escapeLike(value: string): string {
  return value.replace(/[%_,]/g, "");
}

export default async function HouseholdsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase } = await requireUser();

  const query = String(params.q || "").trim();
  const status = params.status === "archived" ? "archived" : "active";
  const requestedPage = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = 20;
  const from = (requestedPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let householdsQuery = supabase
    .from("households")
    .select(
      `
        id,
        household_name,
        household_type,
        primary_contact_id,
        city,
        state,
        country,
        notes,
        is_active,
        created_at,
        household_members(count)
      `,
      { count: "exact" },
    )
    .eq("is_active", status === "active");

  if (query) {
    const cleaned = escapeLike(query);
    householdsQuery = householdsQuery.or(
      [
        `household_name.ilike.%${cleaned}%`,
        `city.ilike.%${cleaned}%`,
        `state.ilike.%${cleaned}%`,
        `notes.ilike.%${cleaned}%`,
      ].join(","),
    );
  }

  const [householdsResult, peopleResult] = await Promise.all([
    householdsQuery
      .order("household_name", { ascending: true })
      .range(from, to),
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name")
      .eq("is_active", true)
      .order("first_name")
      .limit(1000),
  ]);

  const households = householdsResult.data ?? [];
  const people = (peopleResult.data ?? []) as PersonOption[];
  const total = householdsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  function pageHref(page: number): string {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (status !== "active") next.set("status", status);
    if (page > 1) next.set("page", String(page));

    const suffix = next.toString();
    return suffix ? `/households?${suffix}` : "/households";
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
            Customer 360
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Households</h1>
          <p className="mt-2 text-neutral-600">
            Families, shared preferences, relationships and hospitality context.
          </p>
        </div>

        <div className="rounded-2xl border px-5 py-3 text-sm">
          {total} {status === "active" ? "active" : "archived"} households
        </div>
      </div>

      <ErrorPanel
        messages={[
          householdsResult.error?.message || peopleResult.error?.message,
        ]}
      />

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <form className="flex min-w-0 flex-1 flex-wrap gap-3">
              <input
                name="q"
                defaultValue={query}
                placeholder="Search households"
                className="min-w-56 flex-1 rounded-xl border px-4 py-2"
              />

              <select
                aria-label="Status"
                name="status"
                defaultValue={status}
                className="rounded-xl border px-4 py-2"
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>

              <button className="rounded-xl bg-black px-5 py-2 text-white">
                Search
              </button>

              {(query || status !== "active") && (
                <Link
                  href="/households"
                  className="rounded-xl border px-5 py-2"
                >
                  Clear
                </Link>
              )}
            </form>
          </div>

          <div className="mt-6 space-y-3">
            {households.length === 0 ? (
              <div className="rounded-xl bg-neutral-50 p-6 text-sm text-neutral-500">
                No households found.
              </div>
            ) : (
              households.map((household) => {
                const memberCount = Array.isArray(household.household_members)
                  ? Number(household.household_members[0]?.count ?? 0)
                  : 0;

                return (
                  <Link
                    key={household.id}
                    href={`/households/${household.id}`}
                    className="grid gap-2 rounded-xl border p-4 transition hover:bg-neutral-50 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="font-medium">
                        {household.household_name || "Unnamed household"}
                      </div>

                      <div className="mt-1 text-sm text-neutral-600">
                        {[
                          household.household_type,
                          household.city,
                          household.state,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No location recorded"}
                      </div>

                      {household.notes && (
                        <div className="mt-2 line-clamp-2 text-sm text-neutral-500">
                          {household.notes}
                        </div>
                      )}
                    </div>

                    <div className="text-sm text-neutral-500 sm:text-right">
                      {memberCount} {memberCount === 1 ? "member" : "members"}
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between gap-4">
              {currentPage > 1 ? (
                <Link
                  href={pageHref(currentPage - 1)}
                  className="rounded-xl border px-4 py-2 text-sm"
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}

              <span className="text-sm text-neutral-500">
                Page {currentPage} of {totalPages}
              </span>

              {currentPage < totalPages ? (
                <Link
                  href={pageHref(currentPage + 1)}
                  className="rounded-xl border px-4 py-2 text-sm"
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </div>
          )}
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Create household</h2>

          <form action={createHousehold} className="mt-5 space-y-3">
            <input
              name="household_name"
              required
              placeholder="Household name"
              className="w-full rounded-xl border px-3 py-2"
            />

            <select
              aria-label="Type of household"
              name="household_type"
              defaultValue="family"
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="family">Family</option>
              <option value="couple">Couple</option>
              <option value="friends">Friends</option>
              <option value="colleagues">Colleagues</option>
              <option value="organisation">Organisation</option>
              <option value="other">Other</option>
            </select>

            <select
              aria-label="Choose the primary contact"
              name="primary_contact_id"
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="">Choose primary contact</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                </option>
              ))}
            </select>

            <input
              name="address"
              placeholder="Address"
              className="w-full rounded-xl border px-3 py-2"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="city"
                placeholder="City"
                defaultValue="Bengaluru"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="state"
                placeholder="State"
                defaultValue="Karnataka"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="country"
                placeholder="Country"
                defaultValue="India"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="postal_code"
                placeholder="Postal code"
                className="rounded-xl border px-3 py-2"
              />
            </div>

            <textarea
              name="notes"
              placeholder="Household notes"
              className="min-h-24 w-full rounded-xl border p-3"
            />

            <button className="w-full rounded-xl bg-black px-4 py-2 text-white">
              Create household
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
