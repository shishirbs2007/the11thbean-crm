import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createVisit } from "./actions";

type SearchParams = {
  q?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  page?: string;
  error?: string;
  success?: string;
};

type Person = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
};

type RelatedPerson = Person | Person[] | null;

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayName(person: Person): string {
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

function localDateTimeValue(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { supabase } = await requireUser();

  const query = String(params.q || "").trim();
  const source = String(params.source || "").trim();
  const dateFrom = String(params.date_from || "").trim();
  const dateTo = String(params.date_to || "").trim();
  const requestedPage = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = 25;
  const from = (requestedPage - 1) * pageSize;
  const to = from + pageSize - 1;

  let visitsQuery = supabase
    .from("visits")
    .select(
      `
        id,
        person_id,
        visited_at,
        visit_type,
        party_size,
        net_amount,
        payment_method,
        order_reference,
        source,
        visit_context,
        customer_mood,
        satisfaction_score,
        person:people(
          id,
          first_name,
          last_name,
          preferred_name,
          phone
        )
      `,
      { count: "exact" },
    );

  if (source) visitsQuery = visitsQuery.eq("source", source);
  if (dateFrom) {
    visitsQuery = visitsQuery.gte(
      "visited_at",
      new Date(`${dateFrom}T00:00:00`).toISOString(),
    );
  }
  if (dateTo) {
    visitsQuery = visitsQuery.lte(
      "visited_at",
      new Date(`${dateTo}T23:59:59`).toISOString(),
    );
  }
  if (query) {
    visitsQuery = visitsQuery.or(
      [
        `order_reference.ilike.%${query}%`,
        `visit_context.ilike.%${query}%`,
        `staff_notes.ilike.%${query}%`,
        `payment_method.ilike.%${query}%`,
      ].join(","),
    );
  }

  const [visitsResult, peopleResult] = await Promise.all([
    visitsQuery
      .order("visited_at", { ascending: false })
      .range(from, to),
    supabase
      .from("people")
      .select(
        "id, first_name, last_name, preferred_name, phone",
      )
      .eq("is_active", true)
      .order("first_name")
      .limit(1500),
  ]);

  const visits = visitsResult.data ?? [];
  const people = (peopleResult.data ?? []) as Person[];
  const total = visitsResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);

  const totalSpend = visits.reduce(
    (sum, visit) => sum + Number(visit.net_amount ?? 0),
    0,
  );

  function pageHref(page: number): string {
    const next = new URLSearchParams();

    if (query) next.set("q", query);
    if (source) next.set("source", source);
    if (dateFrom) next.set("date_from", dateFrom);
    if (dateTo) next.set("date_to", dateTo);
    if (page > 1) next.set("page", String(page));

    const suffix = next.toString();
    return suffix ? `/visits?${suffix}` : "/visits";
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">
            Operations
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Visits</h1>
          <p className="mt-2 text-neutral-600">
            Record café visits, spend, context and ordered items.
          </p>
        </div>

        <div className="rounded-2xl border px-5 py-3 text-sm">
          {total} visits · ₹{totalSpend.toFixed(0)} on this page
        </div>
      </div>

      {(params.error || visitsResult.error || peopleResult.error) && (
        <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {params.error ||
            visitsResult.error?.message ||
            peopleResult.error?.message}
        </div>
      )}

      {params.success && (
        <div className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800">
          {params.success}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="rounded-2xl border p-6">
          <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <input
              name="q"
              defaultValue={query}
              placeholder="Reference or context"
              className="rounded-xl border px-3 py-2 xl:col-span-2"
            />

            <select
              name="source"
              defaultValue={source}
              className="rounded-xl border px-3 py-2"
            >
              <option value="">All sources</option>
              <option value="manual">Manual</option>
              <option value="petpooja">PetPooja</option>
              <option value="import">Import</option>
              <option value="event">Event</option>
            </select>

            <input
              name="date_from"
              type="date"
              defaultValue={dateFrom}
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="date_to"
              type="date"
              defaultValue={dateTo}
              className="rounded-xl border px-3 py-2"
            />

            <button className="rounded-xl bg-black px-4 py-2 text-white">
              Filter
            </button>

            {(query || source || dateFrom || dateTo) && (
              <Link
                href="/visits"
                className="rounded-xl border px-4 py-2 text-center"
              >
                Clear
              </Link>
            )}
          </form>

          <div className="mt-6 space-y-3">
            {visits.length === 0 ? (
              <div className="rounded-xl bg-neutral-50 p-6 text-sm text-neutral-500">
                No visits found.
              </div>
            ) : (
              visits.map((visit) => {
                const person = one(
                  visit.person as RelatedPerson,
                );

                return (
                  <Link
                    key={visit.id}
                    href={`/visits/${visit.id}`}
                    className="grid gap-3 rounded-xl border p-4 transition hover:bg-neutral-50 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-medium">
                        {person ? displayName(person) : "Guest visit"}
                      </p>

                      <p className="mt-1 text-sm text-neutral-600">
                        {new Date(visit.visited_at).toLocaleString()}
                        {" · "}
                        {visit.visit_type || "walk in"}
                        {" · "}
                        {visit.party_size || 1} guests
                      </p>

                      <p className="mt-1 text-sm text-neutral-500">
                        {[
                          visit.source,
                          visit.payment_method,
                          visit.order_reference,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Manual visit"}
                      </p>

                      {visit.visit_context && (
                        <p className="mt-2 line-clamp-2 text-sm text-neutral-500">
                          {visit.visit_context}
                        </p>
                      )}
                    </div>

                    <div className="text-sm sm:text-right">
                      <p className="font-medium">
                        ₹{Number(visit.net_amount ?? 0).toFixed(0)}
                      </p>

                      {visit.satisfaction_score && (
                        <p className="mt-1 text-neutral-500">
                          Satisfaction {visit.satisfaction_score}/5
                        </p>
                      )}
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
          <h2 className="text-lg font-semibold">Record visit</h2>

          <form action={createVisit} className="mt-5 space-y-3">
            <select
              name="person_id"
              className="w-full rounded-xl border px-3 py-2"
            >
              <option value="">Guest visit</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {displayName(person)}
                  {person.phone ? ` · ${person.phone}` : ""}
                </option>
              ))}
            </select>

            <input
              name="visited_at"
              type="datetime-local"
              defaultValue={localDateTimeValue()}
              className="w-full rounded-xl border px-3 py-2"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <select
                name="visit_type"
                defaultValue="walk_in"
                className="rounded-xl border px-3 py-2"
              >
                <option value="walk_in">Walk in</option>
                <option value="reservation">Reservation</option>
                <option value="event">Event</option>
                <option value="delivery">Delivery</option>
                <option value="takeaway">Takeaway</option>
              </select>

              <input
                name="party_size"
                type="number"
                min="1"
                defaultValue="1"
                placeholder="Party size"
                className="rounded-xl border px-3 py-2"
              />

              <input
                name="gross_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="Gross amount"
                className="rounded-xl border px-3 py-2"
              />

              <input
                name="discount_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="Discount"
                className="rounded-xl border px-3 py-2"
              />

              <input
                name="tax_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="Tax"
                className="rounded-xl border px-3 py-2"
              />

              <input
                name="net_amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="Net amount"
                className="rounded-xl border px-3 py-2"
              />

              <select
                name="payment_method"
                className="rounded-xl border px-3 py-2"
              >
                <option value="">Payment method</option>
                <option value="upi">UPI</option>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="wallet">Wallet</option>
                <option value="complimentary">Complimentary</option>
                <option value="other">Other</option>
              </select>

              <select
                name="source"
                defaultValue="manual"
                className="rounded-xl border px-3 py-2"
              >
                <option value="manual">Manual</option>
                <option value="petpooja">PetPooja</option>
                <option value="import">Import</option>
                <option value="event">Event</option>
              </select>

              <input
                name="order_reference"
                placeholder="Order reference"
                className="rounded-xl border px-3 py-2"
              />

              <input
                name="seating_area"
                placeholder="Seating area"
                className="rounded-xl border px-3 py-2"
              />

              <input
                name="table_reference"
                placeholder="Table"
                className="rounded-xl border px-3 py-2"
              />

              <select
                name="satisfaction_score"
                className="rounded-xl border px-3 py-2"
              >
                <option value="">Satisfaction</option>
                <option value="1">1 / 5</option>
                <option value="2">2 / 5</option>
                <option value="3">3 / 5</option>
                <option value="4">4 / 5</option>
                <option value="5">5 / 5</option>
              </select>
            </div>

            <input
              name="customer_mood"
              placeholder="Customer mood"
              className="w-full rounded-xl border px-3 py-2"
            />

            <textarea
              name="visit_context"
              placeholder="Visit context"
              className="min-h-20 w-full rounded-xl border p-3"
            />

            <textarea
              name="staff_notes"
              placeholder="Staff notes"
              className="min-h-20 w-full rounded-xl border p-3"
            />

            <button className="w-full rounded-xl bg-black px-4 py-2 text-white">
              Record visit
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
