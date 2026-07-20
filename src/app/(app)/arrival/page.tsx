import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  parseArrivalContext,
  type ArrivalContext,
} from "@/lib/intelligence/arrival";
import { quickAddGuest, recordArrival } from "./actions";

type Candidate = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
};

type ArrivalRow = {
  visit_id: string;
  person_id: string;
  greeting_name: string;
  last_name: string | null;
  visited_at: string;
  party_size: number;
  is_new_guest: boolean;
};

export default async function ArrivalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; welcomed?: string; known?: string }>;
}) {
  const { q, welcomed, known } = await searchParams;
  const { supabase } = await requireUser();

  const query = (q ?? "").trim();

  const [candidatesResult, todayResult, welcomedResult] = await Promise.all([
    query.length >= 2
      ? supabase
          .from("people")
          .select("id, first_name, last_name, preferred_name, phone")
          .eq("is_active", true)
          .or(
            `first_name.ilike.%${query}%,last_name.ilike.%${query}%,preferred_name.ilike.%${query}%,phone.ilike.%${query}%`,
          )
          .order("first_name")
          .limit(8)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("arrivals_today").select("*").limit(30),
    welcomed
      ? supabase.rpc("arrival_context", { target_person_id: welcomed })
      : Promise.resolve({ data: null, error: null }),
  ]);

  const candidates = (candidatesResult.data ?? []) as Candidate[];
  const today = (todayResult.data ?? []) as ArrivalRow[];
  const context: ArrivalContext | null = welcomed
    ? parseArrivalContext(welcomedResult.data)
    : null;

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <PageHeader
        eyebrow="At the counter"
        title="Who just walked in?"
        description="Find them, tap once. Everything you need to look after them comes back with it."
      />

      <ErrorPanel
        messages={[candidatesResult.error?.message, todayResult.error?.message]}
      />

      {context && (
        <div className="mt-6 rounded-2xl border-2 border-black p-6">
          <p className="text-sm uppercase tracking-wide text-neutral-500">
            {known ? "Already known — welcomed" : "Welcomed"}
          </p>
          <h2 className="mt-1 text-3xl font-semibold">
            {context.greeting_name}
          </h2>

          {context.allergies.length > 0 && (
            <p className="mt-4 rounded-xl bg-red-50 p-4 text-lg font-semibold text-red-800">
              Allergic to {context.allergies.join(", ")}
            </p>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              ["Usual", context.usual_drink || "Not known yet — ask"],
              ["Often with", context.usual_food || "—"],
              ["Seating", context.seating || "No preference recorded"],
              [
                "Visits",
                context.is_first_visit
                  ? "First time here"
                  : `${context.total_visits} visits`,
              ],
            ].map(([label, text]) => (
              <div key={label} className="rounded-xl bg-neutral-50 p-4">
                <p className="text-sm text-neutral-500">{label}</p>
                <p className="mt-1 text-lg font-medium">{text}</p>
              </div>
            ))}
          </div>

          {context.next_best_action && (
            <div className="mt-4 rounded-xl bg-neutral-900 p-4 text-white">
              <p className="text-sm uppercase tracking-wide text-neutral-400">
                {context.next_best_action.label}
              </p>
              <p className="mt-1 text-lg font-medium">
                {context.next_best_action.suggested_action}
              </p>
              <p className="mt-1 text-sm text-neutral-300">
                {context.next_best_action.why}
              </p>
            </div>
          )}

          {context.staff_summary && (
            <p className="mt-4 text-neutral-600">{context.staff_summary}</p>
          )}

          {context.communities.length > 0 && (
            <p className="mt-2 text-sm text-neutral-500">
              Part of {context.communities.join(", ")}
            </p>
          )}

          <Link
            href={`/customers/${context.person_id}`}
            className="mt-4 inline-block text-sm underline"
          >
            Open their full record
          </Link>
        </div>
      )}

      <div className="mt-8">
        <Section
          title="Find a guest"
          description="Name or phone number. Two letters is enough."
        >
          <form method="get" className="flex flex-wrap gap-3">
            <input
              name="q"
              defaultValue={query}
              placeholder="Name or phone"
              autoFocus
              aria-label="Search for a guest by name or phone"
              className="min-w-56 flex-1 rounded-xl border px-4 py-3 text-lg"
            />
            <button className="rounded-xl bg-black px-6 py-3 text-white">
              Search
            </button>
          </form>

          {query.length >= 2 && candidates.length === 0 && (
            <p className="mt-5 text-neutral-600">
              Nobody found. Add them below — it takes two fields.
            </p>
          )}

          {candidates.length > 0 && (
            <ul className="mt-5 space-y-2">
              {candidates.map((candidate) => {
                const welcome = recordArrival.bind(null, candidate.id);
                const name = `${
                  candidate.preferred_name || candidate.first_name
                } ${candidate.last_name || ""}`.trim();

                return (
                  <li
                    key={candidate.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                  >
                    <div>
                      <p className="text-lg font-medium">{name}</p>
                      {candidate.phone && (
                        <p className="text-sm text-neutral-500">
                          {candidate.phone}
                        </p>
                      )}
                    </div>
                    <form action={welcome} className="flex items-center gap-2">
                      <input
                        name="party_size"
                        type="number"
                        min="1"
                        defaultValue="1"
                        aria-label={`How many people are with ${name}`}
                        className="w-20 rounded-xl border px-3 py-3 text-center"
                      />
                      <SubmitButton
                        pendingText="..."
                        className="rounded-xl bg-black px-6 py-3 text-lg text-white"
                      >
                        They&rsquo;re here
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Somebody new"
          description="A name and one way to reach them. The rest can wait until there is a moment."
        >
          <form action={quickAddGuest} className="grid gap-3 sm:grid-cols-2">
            <input
              name="guest_name"
              required
              placeholder="Name"
              aria-label="Guest name"
              className="rounded-xl border px-4 py-3 sm:col-span-2"
            />
            <input
              name="phone"
              placeholder="Phone"
              aria-label="Phone number"
              className="rounded-xl border px-4 py-3"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              aria-label="Email address"
              className="rounded-xl border px-4 py-3"
            />
            <SubmitButton className="rounded-xl bg-black px-6 py-3 text-white sm:col-span-2">
              Add and welcome
            </SubmitButton>
          </form>
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="In today"
          description="Everyone recorded so far this shift."
        >
          {today.length === 0 ? (
            <p className="text-neutral-600">Nobody yet.</p>
          ) : (
            <ul className="space-y-2">
              {today.map((row) => (
                <li
                  key={row.visit_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <Link
                      href={`/customers/${row.person_id}`}
                      className="font-medium underline"
                    >
                      {row.greeting_name} {row.last_name || ""}
                    </Link>
                    {row.is_new_guest && (
                      <span className="ml-2 text-sm text-neutral-500">
                        first time
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500">
                    {new Date(row.visited_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {row.party_size > 1 && ` · ${row.party_size} people`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
