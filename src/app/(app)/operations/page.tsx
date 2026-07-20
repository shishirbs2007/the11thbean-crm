import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";

export default async function OperationsPage() {
  const { supabase } = await requireUser();

  const [{ data: checklistsData, error }, { data: runsData }] =
    await Promise.all([
      supabase
        .from("operational_checklists")
        .select(
          "id, name, checklist_type, description, operational_checklist_items(id, item_text, sort_order, role_scope)",
        )
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("operational_runs")
        .select("id, business_date, status, shift_name, operational_checklists(name)")
        .order("business_date", { ascending: false })
        .limit(20),
    ]);

  const checklists = checklistsData ?? [];
  const runs = runsData ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Café operations"
        title="Operational checklists"
        description="Opening, closing and equipment routines with a future-ready completion log."
      />

      <ErrorPanel messages={[error?.message]} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {checklists.map((checklist) => {
          const items = [...(checklist.operational_checklist_items ?? [])]
            .sort((a, b) => a.sort_order - b.sort_order);

          return (
            <section key={checklist.id} className="rounded-2xl border p-6">
              <h2 className="text-lg font-semibold">{checklist.name}</h2>
              <p className="mt-1 text-sm text-neutral-500">
                {checklist.description || checklist.checklist_type}
              </p>
              <div className="mt-5 space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-xl bg-neutral-50 p-3"
                  >
                    <span className="mt-1 h-4 w-4 rounded border" />
                    <div>
                      <p className="text-sm">{item.item_text}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {item.role_scope}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="mt-8 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Recent runs</h2>
        <div className="mt-5 space-y-2 text-sm">
          {runs.length === 0 ? (
            <p className="text-neutral-500">No checklist runs yet.</p>
          ) : (
            runs.map((run) => {
              const checklist = Array.isArray(run.operational_checklists)
                ? run.operational_checklists[0]
                : run.operational_checklists;

              return (
                <div
                  key={run.id}
                  className="flex justify-between rounded-xl bg-neutral-50 p-3"
                >
                  <span>
                    {checklist?.name || "Checklist"} · {run.business_date}
                  </span>
                  <span>{run.status}</span>
                </div>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
