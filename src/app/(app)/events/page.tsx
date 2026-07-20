import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";
import { capacityLabel, capacityState } from "@/lib/intelligence/events";
import { createEvent } from "./actions";

type EventItem = {
  id: string;
  name: string;
  starts_at: string;
  location: string | null;
  capacity: number | null;
};

type SummaryRow = {
  event_id: string;
  expected_headcount: number;
  attended_count: number;
};

export default async function EventsPage() {
  const { supabase } = await requireUser();

  const [{ data, error }, summaryResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, name, starts_at, location, capacity")
      .order("starts_at", { ascending: false }),
    supabase
      .from("event_attendance_summary")
      .select("event_id, expected_headcount, attended_count"),
  ]);

  const events: EventItem[] = (data ?? []) as EventItem[];
  const summaries = new Map(
    ((summaryResult.data ?? []) as SummaryRow[]).map((row) => [
      row.event_id,
      row,
    ]),
  );

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        title="Events"
        description="Registrations, attendance and event history."
      />

      <ErrorPanel messages={[error?.message]} />

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
              <Link
                href={`/events/${event.id}`}
                className="font-semibold underline"
              >
                {event.name}
              </Link>
              <p className="mt-2 text-sm text-neutral-600">
                {new Date(event.starts_at).toLocaleString()} ·{" "}
                {event.location || "Location pending"}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {summaries.get(event.id)?.expected_headcount ?? 0} expected
                {event.capacity !== null &&
                  ` · ${capacityLabel(
                    capacityState(
                      summaries.get(event.id)?.expected_headcount ?? 0,
                      event.capacity,
                    ),
                  )}`}
              </p>
            </article>
          ))
        )}
      </div>
    </main>
  );
}
