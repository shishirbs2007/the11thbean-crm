import Link from "next/link";
import { requireUser } from "@/lib/auth";

type CustomerListItem = {
  id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  customer_status: string;
  created_at: string;
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase } = await requireUser();
  const { q = "" } = await searchParams;

  let query = supabase
    .from("people")
    .select(
      "id, first_name, last_name, preferred_name, phone, email, company, customer_status, created_at",
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (q.trim()) {
    const term = q.trim().replaceAll(",", " ");
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,preferred_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  const people: CustomerListItem[] = (data ?? []) as CustomerListItem[];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Customers</h1>
          <p className="mt-2 text-neutral-600">
            Search and build a complete hospitality profile.
          </p>
        </div>
        <Link
          href="/customers/new"
          className="rounded-xl bg-black px-4 py-3 text-sm text-white"
        >
          Add customer
        </Link>
      </div>

      <form className="mt-7 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email or company"
          className="w-full rounded-xl border px-4 py-3"
        />
        <button className="rounded-xl border px-5">Search</button>
      </form>

      {error && <p className="mt-5 text-red-700">{error.message}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border">
        {people.length === 0 ? (
          <p className="p-6 text-neutral-600">No matching customers yet.</p>
        ) : (
          people.map((person) => (
            <Link
              key={person.id}
              href={`/customers/${person.id}`}
              className="grid gap-1 border-b p-5 last:border-b-0 hover:bg-neutral-50 sm:grid-cols-3"
            >
              <div className="font-medium">
                {person.preferred_name || person.first_name}{" "}
                {person.last_name || ""}
              </div>
              <div className="text-sm text-neutral-600">
                {person.phone || person.email || "No contact"}
              </div>
              <div className="text-sm text-neutral-500 sm:text-right">
                {person.company || person.customer_status}
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
