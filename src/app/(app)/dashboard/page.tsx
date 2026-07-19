import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { GlobalSearchForm } from "@/components/search/global-search-form";

type Signals = {
  customers: number;
  new_customers_30d: number;
  visits_30d: number;
  dormant_45d: number;
  open_feedback: number;
  important_dates_total: number;
};

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const [{ data: signalsData, error: signalsError }, { data: recentPeople }] =
    await Promise.all([
      supabase.rpc("crm_dashboard_signals"),
      supabase
        .from("people")
        .select("id, first_name, last_name, preferred_name, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const signals = (signalsData ?? {
    customers: 0,
    new_customers_30d: 0,
    visits_30d: 0,
    dormant_45d: 0,
    open_feedback: 0,
    important_dates_total: 0,
  }) as Signals;

  const cards = [
    ["Customers", signals.customers, "/customers"],
    ["New in 30 days", signals.new_customers_30d, "/customers"],
    ["Visits in 30 days", signals.visits_30d, "/insights"],
    ["Dormant 45+ days", signals.dormant_45d, "/insights"],
    ["Important dates", signals.important_dates_total, "/insights"],
    ["Open feedback", signals.open_feedback, "/insights"],
  ] as const;

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-neutral-600">
        Relationship signals and quick access for the café team.
      </p>

      <div className="mt-7">
        <GlobalSearchForm />
      </div>

      {signalsError && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {signalsError.message}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Recently added customers</h2>
          <Link href="/customers" className="text-sm underline">
            View all
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(recentPeople ?? []).map((person) => (
            <Link
              key={person.id}
              href={`/customers/${person.id}`}
              className="rounded-xl bg-neutral-50 p-4"
            >
              <p className="font-medium">
                {person.preferred_name || person.first_name}{" "}
                {person.last_name || ""}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Added {new Date(person.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
