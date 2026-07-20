import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";
import { recalculateHealth } from "./actions";

export default async function InsightsPage() {
  const { supabase } = await requireUser();

  const [healthResult, dormantResult, valuableResult, referrersResult] =
    await Promise.all([
      supabase
        .from("customer_health")
        .select(
          "person_id, health_score, churn_risk, lifetime_value, average_ticket, total_visits, last_visit_at, people(first_name,last_name,preferred_name)",
        )
        .order("health_score", { ascending: false })
        .limit(100),
      supabase
        .from("customer_health")
        .select(
          "person_id, churn_risk, last_visit_at, people(first_name,last_name,preferred_name)",
        )
        .gte("churn_risk", 60)
        .order("churn_risk", { ascending: false })
        .limit(20),
      supabase
        .from("customer_health")
        .select(
          "person_id, lifetime_value, total_visits, people(first_name,last_name,preferred_name)",
        )
        .order("lifetime_value", { ascending: false })
        .limit(20),
      supabase
        .from("referrals")
        .select(
          "referrer_person_id, people!referrals_referrer_person_id_fkey(first_name,last_name,preferred_name)",
        ),
    ]);

  const health = healthResult.data ?? [];
  const dormant = dormantResult.data ?? [];
  const valuable = valuableResult.data ?? [];

  const referralCounts = new Map<string, number>();
  for (const row of referrersResult.data ?? []) {
    referralCounts.set(
      row.referrer_person_id,
      (referralCounts.get(row.referrer_person_id) ?? 0) + 1,
    );
  }

  const averageHealth =
    health.length === 0
      ? 0
      : health.reduce((sum, row) => sum + Number(row.health_score ?? 0), 0) /
        health.length;

  const totalValue = health.reduce(
    (sum, row) => sum + Number(row.lifetime_value ?? 0),
    0,
  );

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader
          eyebrow="Customer intelligence"
          title="Health and insights"
          description="Recency, frequency, value and churn signals calculated from real customer activity."
        />

        <form action={recalculateHealth}>
          <button className="rounded-xl bg-black px-4 py-3 text-white">
            Recalculate now
          </button>
        </form>
      </div>

      <ErrorPanel messages={[healthResult.error?.message]} />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Health records</p>
          <p className="mt-2 text-3xl font-semibold">{health.length}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Average health</p>
          <p className="mt-2 text-3xl font-semibold">
            {averageHealth.toFixed(0)}
          </p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">High churn risk</p>
          <p className="mt-2 text-3xl font-semibold">{dormant.length}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Recorded lifetime value</p>
          <p className="mt-2 text-3xl font-semibold">
            ₹{totalValue.toFixed(0)}
          </p>
        </article>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Reconnect now</h2>
          <div className="mt-5 space-y-3">
            {dormant.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No high-risk customers.
              </p>
            ) : (
              dormant.map((row) => {
                const person = Array.isArray(row.people)
                  ? row.people[0]
                  : row.people;

                return (
                  <Link
                    key={row.person_id}
                    href={`/customers/${row.person_id}`}
                    className="flex justify-between rounded-xl bg-neutral-50 p-4 text-sm"
                  >
                    <span>
                      {person?.preferred_name ||
                        person?.first_name ||
                        "Unknown"}{" "}
                      {person?.last_name || ""}
                    </span>
                    <span>{Number(row.churn_risk).toFixed(0)}% risk</span>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Highest lifetime value</h2>
          <div className="mt-5 space-y-3">
            {valuable.map((row) => {
              const person = Array.isArray(row.people)
                ? row.people[0]
                : row.people;

              return (
                <Link
                  key={row.person_id}
                  href={`/customers/${row.person_id}`}
                  className="flex justify-between rounded-xl bg-neutral-50 p-4 text-sm"
                >
                  <span>
                    {person?.preferred_name || person?.first_name || "Unknown"}{" "}
                    {person?.last_name || ""}
                  </span>
                  <span>
                    ₹{Number(row.lifetime_value).toFixed(0)} ·{" "}
                    {row.total_visits} visits
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">Customer health table</h2>
        </div>

        {health.map((row) => {
          const person = Array.isArray(row.people) ? row.people[0] : row.people;

          return (
            <Link
              key={row.person_id}
              href={`/customers/${row.person_id}`}
              className="grid gap-2 border-b p-5 last:border-b-0 hover:bg-neutral-50 sm:grid-cols-5"
            >
              <span className="font-medium">
                {person?.preferred_name || person?.first_name || "Unknown"}{" "}
                {person?.last_name || ""}
              </span>
              <span>Health {Number(row.health_score).toFixed(0)}</span>
              <span>Risk {Number(row.churn_risk).toFixed(0)}%</span>
              <span>{row.total_visits} visits</span>
              <span className="sm:text-right">
                ₹{Number(row.lifetime_value).toFixed(0)}
              </span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
