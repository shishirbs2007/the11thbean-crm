import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";
import {
  communityStatus,
  type CommunityHealthRow,
} from "@/lib/intelligence/events";
import { createCommunity } from "./actions";

type CommunityItem = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: queryError, success } = await searchParams;
  const { supabase } = await requireUser();

  const [{ data, error }, healthResult] = await Promise.all([
    supabase
      .from("communities")
      .select("id, name, description, is_active")
      .order("name"),
    supabase.from("community_health").select("*"),
  ]);

  const communities: CommunityItem[] = (data ?? []) as CommunityItem[];
  const health = new Map(
    ((healthResult.data ?? []) as (CommunityHealthRow & {
      community_id: string;
    })[]).map((row) => [row.community_id, row]),
  );

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        title="Communities"
        description="Clubs, circles and recurring groups around the café."
      />

      {success && <p className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-green-800">{success}</p>}

      {(queryError || error) && (
        <p className="mt-4 text-red-700">
          {queryError || error?.message}
        </p>
      )}

      <form
        action={createCommunity}
        className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2"
      >
        <input
          name="name"
          required
          placeholder="Community name"
          className="rounded-xl border px-4 py-3"
        />
        <input
          name="description"
          placeholder="Description"
          className="rounded-xl border px-4 py-3"
        />
        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">
          Create community
        </button>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {communities.length === 0 ? (
          <p className="text-neutral-600">No communities yet.</p>
        ) : (
          communities.map((community) => (
            <article key={community.id} className="rounded-2xl border p-5">
              <h2 className="font-semibold">{community.name}</h2>
              <p className="mt-2 text-sm text-neutral-600">
                {community.description || "No description"}
              </p>
              {(() => {
                const row = health.get(community.id);
                if (!row) return null;
                const status = communityStatus(row);

                return (
                  <div className="mt-3 text-sm">
                    <p className="text-neutral-600">
                      {row.active_members} member
                      {row.active_members === 1 ? "" : "s"} ·{" "}
                      {row.events_last_quarter} event
                      {row.events_last_quarter === 1 ? "" : "s"} this quarter
                    </p>
                    <p
                      className={
                        status.needsAttention
                          ? "mt-1 font-medium text-amber-700"
                          : "mt-1 text-neutral-500"
                      }
                    >
                      {status.label}
                    </p>
                  </div>
                );
              })()}
            </article>
          ))
        )}
      </div>
    </main>
  );
}
