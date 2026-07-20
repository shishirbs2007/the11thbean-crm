import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { GlobalSearchForm } from "@/components/search/global-search-form";

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const today = new Date();
  const sevenDays = new Date(today);
  sevenDays.setDate(sevenDays.getDate() - 7);

  const [
    customersResult,
    visitsResult,
    revenueResult,
    tasksResult,
    datesResult,
    feedbackResult,
    riskResult,
    recentVisitsResult,
  ] = await Promise.all([
    supabase
      .from("people")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase
      .from("visits")
      .select("id", { count: "exact", head: true })
      .gte("visited_at", sevenDays.toISOString()),
    supabase
      .from("visits")
      .select("net_amount")
      .gte("visited_at", sevenDays.toISOString()),
    supabase
      .from("customer_tasks")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase.rpc("upcoming_important_dates", { days_ahead: 14 }),
    supabase
      .from("customer_feedback")
      .select("id", { count: "exact", head: true })
      .eq("resolution_status", "open"),
    supabase
      .from("customer_health")
      .select("person_id", { count: "exact", head: true })
      .gte("churn_risk", 60),
    supabase
      .from("visits")
      .select(
        "id,visited_at,net_amount,person_id,people(first_name,last_name,preferred_name)",
      )
      .order("visited_at", { ascending: false })
      .limit(10),
  ]);

  const revenue = (revenueResult.data ?? []).reduce(
    (sum, row) => sum + Number(row.net_amount ?? 0),
    0,
  );

  const cards = [
    ["Customers", customersResult.count ?? 0, "/customers"],
    ["Visits in 7 days", visitsResult.count ?? 0, "/visits"],
    ["Revenue in 7 days", `₹${revenue.toFixed(0)}`, "/visits"],
    ["Open follow-ups", tasksResult.count ?? 0, "/follow-ups"],
    ["Dates in 14 days", (datesResult.data ?? []).length, "/important-dates"],
    ["Open feedback", feedbackResult.count ?? 0, "/feedback"],
    ["High churn risk", riskResult.count ?? 0, "/insights"],
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-neutral-600">
        The café relationship pulse, operational priorities and recent activity.
      </p>

      <div className="mt-7">
        <GlobalSearchForm />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border p-5 hover:bg-neutral-50"
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </Link>
        ))}
      </div>

      <section className="mt-8 rounded-2xl border p-6">
        <div className="flex justify-between gap-4">
          <h2 className="text-lg font-semibold">Recent visits</h2>
          <Link href="/visits" className="text-sm underline">
            View all
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {(recentVisitsResult.data ?? []).map((visit) => {
            const person = Array.isArray(visit.people)
              ? visit.people[0]
              : visit.people;
            return (
              <Link
                key={visit.id}
                href={`/visits/${visit.id}`}
                className="grid gap-2 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-3"
              >
                <span className="font-medium">
                  {person?.preferred_name || person?.first_name || "Guest"}{" "}
                  {person?.last_name || ""}
                </span>
                <span>{new Date(visit.visited_at).toLocaleString()}</span>
                <span className="sm:text-right">
                  ₹{Number(visit.net_amount ?? 0).toFixed(0)}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
