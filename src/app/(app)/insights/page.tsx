import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function InsightsPage() {
  const { supabase } = await requireUser();
  const since = new Date();
  since.setDate(since.getDate() - 45);

  const [
    customersResult,
    recentVisitsResult,
    datesResult,
    referralsResult,
    feedbackResult,
  ] = await Promise.all([
    supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name")
      .eq("is_active", true),
    supabase
      .from("visits")
      .select("person_id")
      .gte("visited_at", since.toISOString()),
    supabase.from("important_dates").select("id"),
    supabase.from("referrals").select("referrer_person_id"),
    supabase
      .from("customer_feedback")
      .select("id")
      .eq("resolution_status", "open"),
  ]);

  const customers = customersResult.data ?? [];
  const recentIds = new Set(
    (recentVisitsResult.data ?? []).map((visit) => visit.person_id),
  );
  const dormant = customers.filter(
    (customer) => !recentIds.has(customer.id),
  );

  const counts = new Map<string, number>();
  for (const referral of referralsResult.data ?? []) {
    counts.set(
      referral.referrer_person_id,
      (counts.get(referral.referrer_person_id) ?? 0) + 1,
    );
  }

  const topReferrers = customers
    .map((customer) => ({
      ...customer,
      referrals: counts.get(customer.id) ?? 0,
    }))
    .filter((customer) => customer.referrals > 0)
    .sort((a, b) => b.referrals - a.referrals)
    .slice(0, 10);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Insights</h1>
      <p className="mt-2 text-neutral-600">
        Early signals from relationship data.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Customers</p>
          <p className="mt-2 text-3xl font-semibold">{customers.length}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">
            No visit in 45 days
          </p>
          <p className="mt-2 text-3xl font-semibold">{dormant.length}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">
            Important dates recorded
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {(datesResult.data ?? []).length}
          </p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">
            Open feedback cases
          </p>
          <p className="mt-2 text-3xl font-semibold">
            {(feedbackResult.data ?? []).length}
          </p>
        </article>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="font-semibold">Reconnect candidates</h2>
          <div className="mt-4 space-y-2">
            {dormant.slice(0, 20).map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="block rounded-xl bg-neutral-50 p-3 text-sm"
              >
                {customer.preferred_name || customer.first_name}{" "}
                {customer.last_name || ""}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="font-semibold">Top introducers</h2>
          <div className="mt-4 space-y-2">
            {topReferrers.map((customer) => (
              <Link
                key={customer.id}
                href={`/customers/${customer.id}`}
                className="flex justify-between rounded-xl bg-neutral-50 p-3 text-sm"
              >
                <span>
                  {customer.preferred_name || customer.first_name}{" "}
                  {customer.last_name || ""}
                </span>
                <span>{customer.referrals}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
