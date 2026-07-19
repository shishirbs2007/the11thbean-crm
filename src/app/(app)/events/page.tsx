import { requireUser } from "@/lib/auth";
import { createEvent } from "./actions";

type EventItem = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
  capacity: number | null;
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error: queryError, success } = await searchParams;
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("events")
    .select("id, name, starts_at, location, capacity")
    .order("starts_at", { ascending: false });

  const events: EventItem[] = (data ?? []) as EventItem[];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Events</h1>
      <p className="mt-2 text-neutral-600">
        Registrations, attendance and event history.
      </p>

      {success && <p className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-green-800">{success}</p>}

      {(queryError || error) && (
        <p className="mt-4 text-red-700">
          {queryError || error?.message}
        </p>
      )}

      <form
        action={createEvent}
        className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2"
      >
        <input
          name="name"
          required
          placeholder="Event name"
          className="rounded-xl border px-4 py-3"
        />
        <input
          name="starts_at"
          required
          type="datetime-local"
          className="rounded-xl border px-4 py-3"
        />
        <input
          name="location"
          placeholder="Location"
          className="rounded-xl border px-4 py-3"
        />
        <input
          name="capacity"
          min="1"
          type="number"
          placeholder="Capacity"
          className="rounded-xl border px-4 py-3"
        />
        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">
          Create event
        </button>
      </form>

      <div className="mt-6 space-y-3">
        {events.length === 0 ? (
          <p className="text-neutral-600">No events yet.</p>
        ) : (
          events.map((event) => (
            <article key={event.id} className="rounded-2xl border p-5">
              <h2 className="font-semibold">{event.name}</h2>
              <p className="mt-2 text-sm text-neutral-600">
                {new Date(event.starts_at).toLocaleString()} ·{" "}
                {event.location || "Location pending"}
              </p>
              {event.capacity !== null && (
                <p className="mt-1 text-xs text-neutral-500">
                  Capacity: {event.capacity}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </main>
  );
}
