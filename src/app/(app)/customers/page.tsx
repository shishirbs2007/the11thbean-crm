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

const PAGE_SIZE = 25;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    sort?: string;
  }>;
}) {
  const { supabase } = await requireUser();
  const {
    q = "",
    page = "1",
    sort = "newest",
  } = await searchParams;

  const currentPage = Math.max(1, Number(page) || 1);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("people")
    .select(
      "id, first_name, last_name, preferred_name, phone, email, company, customer_status, created_at",
      { count: "exact" },
    )
    .eq("is_active", true)
    .range(from, to);

  if (sort === "oldest") {
    query = query.order("created_at", { ascending: true });
  } else if (sort === "name") {
    query = query.order("first_name", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (q.trim()) {
    const term = q.trim().replaceAll(",", " ");
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,preferred_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await query;
  const people = (data ?? []) as CustomerListItem[];

  const totalPages = Math.max(
    1,
    Math.ceil((count ?? 0) / PAGE_SIZE),
  );

  const buildHref = (targetPage: number) => {
    const params = new URLSearchParams();

    if (q.trim()) params.set("q", q.trim());
    if (sort) params.set("sort", sort);
    params.set("page", String(targetPage));

    return `/customers?${params.toString()}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Customers</h1>
          <p className="mt-2 text-neutral-600">
            Search and manage complete hospitality profiles.
          </p>
        </div>

        <Link
          href="/customers/new"
          className="rounded-xl bg-black px-4 py-3 text-sm font-medium text-white"
          role="button"
        >
          Add customer
        </Link>
      </div>

      <form className="mt-7 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email or company"
          className="rounded-xl border px-4 py-3"
        />

        <select
          name="sort"
          defaultValue={sort}
          className="rounded-xl border px-4 py-3"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
        </select>

        <button className="rounded-xl border px-5 py-3 font-medium">
          Search
        </button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500">
        <span>
          {count ?? 0} customer{count === 1 ? "" : "s"}
        </span>

        {q.trim() && (
          <Link href="/customers" className="underline">
            Clear search
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border">
        {people.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">No matching customers</p>
            <p className="mt-2 text-sm text-neutral-500">
              Try another search term or add a new customer.
            </p>
            <Link
              href="/customers/new"
              className="mt-5 inline-block rounded-xl bg-black px-4 py-3 text-sm text-white"
              role="button"
            >
              Add customer
            </Link>
          </div>
        ) : (
          people.map((person) => (
            <Link
              key={person.id}
              href={`/customers/${person.id}`}
              className="grid gap-2 border-b p-5 last:border-b-0 hover:bg-neutral-50 sm:grid-cols-[1.2fr_1fr_1fr_auto]"
            >
              <div>
                <p className="font-medium">
                  {person.preferred_name || person.first_name}{" "}
                  {person.last_name || ""}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Added{" "}
                  {new Date(person.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="text-sm text-neutral-600">
                {person.phone || "No phone"}
              </div>

              <div className="text-sm text-neutral-600">
                {person.email || person.company || "No email or company"}
              </div>

              <div className="text-sm capitalize text-neutral-500 sm:text-right">
                {person.customer_status}
              </div>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between gap-4">
          {currentPage > 1 ? (
            <Link
              href={buildHref(currentPage - 1)}
              className="rounded-xl border px-4 py-2 text-sm"
              role="button"
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
              href={buildHref(currentPage + 1)}
              className="rounded-xl border px-4 py-2 text-sm"
              role="button"
            >
              Next
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </main>
  );
}
