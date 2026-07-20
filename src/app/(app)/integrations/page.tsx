import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";

export default async function IntegrationsPage() {
  const { supabase } = await requireUser();

  const [
    { data: runsData, error: runsError },
    { data: errorsData, error: errorsError },
  ] = await Promise.all([
    supabase
      .from("integration_sync_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .from("integration_errors")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const runs = runsData ?? [];
  const errors = errorsData ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Data connections"
        title="Integrations"
        description="Provider-neutral monitoring for PetPooja and future external systems."
      />

      <ErrorPanel messages={[runsError?.message || errorsError?.message]} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Recent sync runs</h2>
          <div className="mt-5 space-y-3">
            {runs.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No integration runs yet.
              </p>
            ) : (
              runs.map((run) => (
                <div
                  key={run.id}
                  className="rounded-xl bg-neutral-50 p-4 text-sm"
                >
                  <p className="font-medium">
                    {run.provider} · {run.sync_type}
                  </p>
                  <p className="mt-1 text-neutral-500">
                    {run.status} · {new Date(run.started_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Integration errors</h2>
          <div className="mt-5 space-y-3">
            {errors.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No recorded integration errors.
              </p>
            ) : (
              errors.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl bg-neutral-50 p-4 text-sm"
                >
                  <p className="font-medium">{item.error_code || "Error"}</p>
                  <p className="mt-1 text-neutral-600">{item.error_message}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
