import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";

export default async function AuditPage() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  const entries = data ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Governance"
        title="Audit trail"
        description="A foundation for recording important administrative and data actions."
      />

      {error && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-7 overflow-hidden rounded-2xl border">
        {entries.length === 0 ? (
          <p className="p-6 text-neutral-600">
            No audit events have been recorded yet.
          </p>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              className="grid gap-2 border-b p-5 last:border-b-0 sm:grid-cols-4"
            >
              <span>{entry.action}</span>
              <span>{entry.entity_type}</span>
              <span className="text-sm text-neutral-600">
                {entry.summary || entry.entity_id || ""}
              </span>
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
