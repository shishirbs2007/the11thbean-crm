import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string;
    entity_type?: string;
  }>;
}) {
  const params = await searchParams;
  const { supabase } = await requireUser();

  let query = supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (params.action) query = query.eq("action", params.action);
  if (params.entity_type) {
    query = query.eq("entity_type", params.entity_type);
  }

  const { data, error } = await query;
  const entries = data ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="Administrative and data-change history with searchable action and entity filters."
      />

      <form className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-3">
        <input name="action" defaultValue={params.action || ""} placeholder="Action" className="rounded-xl border px-3 py-2" />
        <input name="entity_type" defaultValue={params.entity_type || ""} placeholder="Entity type" className="rounded-xl border px-3 py-2" />
        <button className="rounded-xl bg-black px-4 py-2 text-white">Filter</button>
      </form>

      {error && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-7 overflow-hidden rounded-2xl border">
        {entries.length === 0 ? (
          <p className="p-6 text-neutral-600">No audit events.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="grid gap-2 border-b p-5 last:border-b-0 sm:grid-cols-5">
              <span className="font-medium">{entry.action}</span>
              <span>{entry.entity_type}</span>
              <span className="font-mono text-xs">{entry.entity_id || ""}</span>
              <span className="text-sm text-neutral-600">{entry.summary || ""}</span>
              <span className="text-sm text-neutral-500 sm:text-right">
                {new Date(entry.created_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
