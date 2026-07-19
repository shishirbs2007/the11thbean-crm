import { requireUser } from "@/lib/auth";

export default async function HouseholdsPage() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("households")
    .select("id, household_name, locality, city")
    .eq("is_active", true)
    .order("household_name");

  const households = data ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Households</h1>
      <p className="mt-2 text-neutral-600">
        Families and groups that visit together.
      </p>
      {error && <p className="mt-5 text-red-700">{error.message}</p>}
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {households.map((household) => (
          <article key={household.id} className="rounded-2xl border p-5">
            <h2 className="font-semibold">{household.household_name}</h2>
            <p className="mt-2 text-sm text-neutral-500">
              {[household.locality, household.city]
                .filter(Boolean)
                .join(", ") || "Location not recorded"}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
