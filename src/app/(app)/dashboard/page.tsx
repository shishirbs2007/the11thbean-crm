import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const [
    peopleResult,
    communitiesResult,
    eventsResult,
    visitsResult,
  ] = await Promise.all([
    supabase.from("people").select("*", { count: "exact", head: true }),
    supabase
      .from("communities")
      .select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("visits").select("*", { count: "exact", head: true }),
  ]);

  const cards = [
    ["Customers", peopleResult.count ?? 0, "/customers"],
    ["Visits", visitsResult.count ?? 0, "/customers"],
    ["Communities", communitiesResult.count ?? 0, "/communities"],
    ["Events", eventsResult.count ?? 0, "/events"],
  ] as const;

  const firstError =
    peopleResult.error ||
    communitiesResult.error ||
    eventsResult.error ||
    visitsResult.error;

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-neutral-600">
        The café relationship layer at a glance.
      </p>

      {firstError && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {firstError.message}
        </p>
      )}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link
            key={label}
            href={href}
            className="rounded-2xl border p-5"
          >
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Start here</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Claim the first admin role in Settings, then add customers,
          communities and events.
        </p>
      </div>
    </main>
  );
}
