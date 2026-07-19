import { requireUser } from "@/lib/auth";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: queryError } = await searchParams;
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("communities")
    .select("id, name, description, is_active")
    .order("name");

  const communities: CommunityItem[] = (data ?? []) as CommunityItem[];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Communities</h1>
      <p className="mt-2 text-neutral-600">
        Clubs, circles and recurring groups around the café.
      </p>

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
            </article>
          ))
        )}
      </div>
    </main>
  );
}
