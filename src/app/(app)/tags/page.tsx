import { requireUser } from "@/lib/auth";
import { createTag } from "./actions";

export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: queryError } = await searchParams;
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("tags")
    .select("id, name, description")
    .order("name");

  const tags = data ?? [];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Customer tags</h1>
      <p className="mt-2 text-neutral-600">
        Flexible labels for hospitality, community and relationship context.
      </p>

      {(queryError || error) && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {queryError || error?.message}
        </p>
      )}

      <form
        action={createTag}
        className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2"
      >
        <input
          name="name"
          required
          placeholder="Tag name"
          className="rounded-xl border px-4 py-3"
        />
        <input
          name="description"
          placeholder="Description"
          className="rounded-xl border px-4 py-3"
        />
        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">
          Create tag
        </button>
      </form>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tags.map((tag) => (
          <article key={tag.id} className="rounded-2xl border p-5">
            <h2 className="font-semibold">{tag.name}</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {tag.description || "No description"}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
