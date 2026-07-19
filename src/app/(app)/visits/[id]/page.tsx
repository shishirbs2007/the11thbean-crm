import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Section } from "@/components/customer360/section";
import {
  addVisitItem,
  deleteVisit,
  deleteVisitItem,
  updateVisit,
} from "../actions";

type Person = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
};

function one<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function displayName(person: Person): string {
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

function inputDateTime(value: string): string {
  const date = new Date(value);
  const offset = date.getTimezoneOffset();

  return new Date(date.getTime() - offset * 60_000)
    .toISOString()
    .slice(0, 16);
}

export default async function VisitPage({
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

  const [visitResult, itemsResult, peopleResult] = await Promise.all([
    supabase
      .from("visits")
      .select(
        `
          *,
          person:people(
            id,
            first_name,
            last_name,
            preferred_name,
            phone
          )
        `,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("visit_items")
      .select("*")
      .eq("visit_id", id)
      .order("created_at"),
    supabase
      .from("people")
      .select(
        "id, first_name, last_name, preferred_name, phone",
      )
      .eq("is_active", true)
      .order("first_name")
      .limit(1500),
  ]);

  const visit = visitResult.data;
  if (!visit) notFound();

  const person = one(visit.person as Person | Person[] | null);
  const items = itemsResult.data ?? [];
  const people = (peopleResult.data ?? []) as Person[];

  const updateAction = updateVisit.bind(null, id);
  const itemAction = addVisitItem.bind(null, id);
  const deleteAction = deleteVisit.bind(null, id);

  const errors = [
    visitResult.error?.message,
    itemsResult.error?.message,
    peopleResult.error?.message,
  ].filter(Boolean);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <Link
            href="/visits"
            className="text-sm text-neutral-500 hover:text-black"
          >
            Back to visits
          </Link>

          <p className="mt-5 text-sm uppercase tracking-[0.18em] text-neutral-500">
            Visit record
          </p>

          <h1 className="mt-2 text-3xl font-semibold">
            {person ? displayName(person) : "Guest visit"}
          </h1>

          <p className="mt-2 text-neutral-600">
            {new Date(visit.visited_at).toLocaleString()}
            {" · "}
            ₹{Number(visit.net_amount ?? 0).toFixed(0)}
            {" · "}
            {visit.party_size || 1} guests
          </p>
        </div>

        {visit.order_reference && (
  <p className="mt-2 text-sm text-neutral-500">
    Order reference: {visit.order_reference}
  </p>
)}

        <form action={deleteAction}>
          <button className="rounded-2xl border border-red-300 px-5 py-3 text-sm text-red-700">
            Delete visit
          </button>
        </form>
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
        <Section title="Visit details">
          <form action={updateAction} className="grid gap-3 sm:grid-cols-2">
            <select
              name="person_id"
              defaultValue={visit.person_id || ""}
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            >
              <option value="">Guest visit</option>
              {people.map((option) => (
                <option key={option.id} value={option.id}>
                  {displayName(option)}
                  {option.phone ? ` · ${option.phone}` : ""}
                </option>
              ))}
            </select>

            <input
              name="visited_at"
              type="datetime-local"
              defaultValue={inputDateTime(visit.visited_at)}
              className="rounded-xl border px-3 py-2"
            />

            <select
              name="visit_type"
              defaultValue={visit.visit_type || "walk_in"}
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
              defaultValue={visit.party_size || 1}
              className="rounded-xl border px-3 py-2"
            />

            <select
              name="source"
              defaultValue={visit.source || "manual"}
              className="rounded-xl border px-3 py-2"
            >
              <option value="manual">Manual</option>
              <option value="petpooja">PetPooja</option>
              <option value="import">Import</option>
              <option value="event">Event</option>
            </select>

            <input
              name="gross_amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={Number(visit.gross_amount ?? 0)}
              placeholder="Gross amount"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="discount_amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={Number(visit.discount_amount ?? 0)}
              placeholder="Discount"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="tax_amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={Number(visit.tax_amount ?? 0)}
              placeholder="Tax"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="net_amount"
              type="number"
              min="0"
              step="0.01"
              defaultValue={Number(visit.net_amount ?? 0)}
              placeholder="Net amount"
              className="rounded-xl border px-3 py-2"
            />

            <select
              name="payment_method"
              defaultValue={visit.payment_method || ""}
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

            <input
              name="order_reference"
              defaultValue={visit.order_reference || ""}
              placeholder="Order reference"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="seating_area"
              defaultValue={visit.seating_area || ""}
              placeholder="Seating area"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="table_reference"
              defaultValue={visit.table_reference || ""}
              placeholder="Table"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="customer_mood"
              defaultValue={visit.customer_mood || ""}
              placeholder="Customer mood"
              className="rounded-xl border px-3 py-2"
            />

            <select
              name="satisfaction_score"
              defaultValue={visit.satisfaction_score || ""}
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Satisfaction</option>
              <option value="1">1 / 5</option>
              <option value="2">2 / 5</option>
              <option value="3">3 / 5</option>
              <option value="4">4 / 5</option>
              <option value="5">5 / 5</option>
            </select>

            <textarea
              name="visit_context"
              defaultValue={visit.visit_context || ""}
              placeholder="Visit context"
              className="min-h-20 rounded-xl border p-3 sm:col-span-2"
            />

            <textarea
              name="staff_notes"
              defaultValue={visit.staff_notes || ""}
              placeholder="Staff notes"
              className="min-h-20 rounded-xl border p-3 sm:col-span-2"
            />

            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Save visit
            </button>
          </form>
        </Section>

        <Section title="Ordered items">
          <form action={itemAction} className="grid gap-3 sm:grid-cols-2">
            <input
              name="item_name"
              required
              placeholder="Item name"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="category"
              placeholder="Category"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="quantity"
              type="number"
              min="0.01"
              step="0.01"
              defaultValue="1"
              placeholder="Quantity"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="unit_price"
              type="number"
              min="0"
              step="0.01"
              placeholder="Unit price"
              className="rounded-xl border px-3 py-2"
            />

            <input
              name="notes"
              placeholder="Item notes"
              className="rounded-xl border px-3 py-2 sm:col-span-2"
            />

            <button className="rounded-xl border px-4 py-2 sm:col-span-2">
              Add item
            </button>
          </form>

          <div className="mt-6 space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No item-level data recorded.
              </p>
            ) : (
              items.map((item) => {
                const removeAction = deleteVisitItem.bind(
                  null,
                  id,
                  item.id,
                );

                return (
                  <article
                    key={item.id}
                    className="flex items-start justify-between gap-4 rounded-xl bg-neutral-50 p-4"
                  >
                    <div>
                      <p className="font-medium">{item.item_name}</p>

                      <p className="mt-1 text-sm text-neutral-600">
                        {Number(item.quantity)} × ₹
                        {Number(item.unit_price).toFixed(2)}
                        {item.category ? ` · ${item.category}` : ""}
                      </p>

                      {item.notes && (
                        <p className="mt-1 text-sm text-neutral-500">
                          {item.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="font-medium">
                        ₹{Number(item.total_amount).toFixed(2)}
                      </p>

                      <form action={removeAction} className="mt-2">
                        <button className="text-sm text-red-700">
                          Remove
                        </button>
                      </form>
                    </div>
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
