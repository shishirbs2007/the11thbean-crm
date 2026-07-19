import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";

export default async function SegmentsPage() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("saved_segments")
    .select("id, name, description, filter_definition")
    .eq("is_active", true)
    .order("name");

  const segments = data ?? [];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <PageHeader
        eyebrow="Customer intelligence"
        title="Saved segments"
        description="Reusable customer groups for service, re-engagement and community work."
      />

      {error && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {error.message}
        </p>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2">
        {segments.map((segment) => (
          <article key={segment.id} className="rounded-2xl border p-6">
            <h2 className="font-semibold">{segment.name}</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {segment.description || "No description"}
            </p>
            <pre className="mt-4 overflow-auto rounded-xl bg-neutral-50 p-3 text-xs">
              {JSON.stringify(segment.filter_definition, null, 2)}
            </pre>
          </article>
        ))}
      </div>
    </main>
  );
}
