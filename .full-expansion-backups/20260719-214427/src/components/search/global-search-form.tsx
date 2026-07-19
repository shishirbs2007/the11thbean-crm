export function GlobalSearchForm({
  defaultValue = "",
}: {
  defaultValue?: string;
}) {
  return (
    <form action="/search" className="flex gap-2">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="Search customers, notes, tags, communities or events"
        className="w-full rounded-xl border px-4 py-3"
      />
      <button className="rounded-xl bg-black px-5 py-3 text-white">
        Search
      </button>
    </form>
  );
}
