import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { GlobalSearchForm } from "@/components/search/global-search-form";

type SearchResult = {
  result_type: string;
  result_id: string;
  title: string;
  subtitle: string | null;
  href: string;
  rank_score: number;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();

  const { data, error } = q.trim()
    ? await supabase.rpc("crm_global_search", {
        search_term: q.trim(),
      })
    : { data: [], error: null };

  const results = (data ?? []) as SearchResult[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Global search</h1>
      <p className="mt-2 text-neutral-600">
        Search across customer identities, notes, tags, communities and events.
      </p>

      <div className="mt-7">
        <GlobalSearchForm defaultValue={q} />
      </div>

      <ErrorPanel messages={[error?.message]} />

      <div className="mt-7 overflow-hidden rounded-2xl border">
        {!q.trim() ? (
          <p className="p-6 text-neutral-600">Enter a search term.</p>
        ) : results.length === 0 ? (
          <p className="p-6 text-neutral-600">No matching records.</p>
        ) : (
          results.map((result, index) => (
            <Link
              key={`${result.result_type}-${result.result_id}-${index}`}
              href={result.href}
              className="block border-b p-5 last:border-b-0 hover:bg-neutral-50"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{result.title}</p>
                  {result.subtitle && (
                    <p className="mt-1 text-sm text-neutral-600">
                      {result.subtitle}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs uppercase tracking-wide">
                  {result.result_type}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
