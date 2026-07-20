import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";

export default async function StaffPage() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("app_roles")
    .select("user_id, role, created_at")
    .order("created_at");

  const roles = data ?? [];

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <PageHeader
        eyebrow="Access control"
        title="Staff roles"
        description="The current role registry for administrators, managers and baristas."
      />

      <ErrorPanel messages={[error?.message]} />

      <div className="mt-7 overflow-hidden rounded-2xl border">
        {roles.length === 0 ? (
          <p className="p-6 text-neutral-600">
            No roles assigned yet. Claim the first administrator role in Settings.
          </p>
        ) : (
          roles.map((item) => (
            <div
              key={item.user_id}
              className="grid gap-2 border-b p-5 last:border-b-0 sm:grid-cols-3"
            >
              <span className="font-mono text-xs">{item.user_id}</span>
              <span>{item.role}</span>
              <span className="text-sm text-neutral-500 sm:text-right">
                {new Date(item.created_at).toLocaleString()}
              </span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
