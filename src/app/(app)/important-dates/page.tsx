import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";

type UpcomingDate = {
  important_date_id: string;
  person_id: string;
  customer_name: string;
  date_type: string;
  label: string | null;
  original_date: string;
  next_occurrence: string;
  days_until: number;
};

export default async function ImportantDatesPage() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc(
    "upcoming_important_dates",
    { days_ahead: 90 },
  );

  const dates = (data ?? []) as UpcomingDate[];

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <PageHeader
        eyebrow="Relationship calendar"
        title="Important dates"
        description="Upcoming birthdays, anniversaries and customer milestones."
      />

      <ErrorPanel messages={[error?.message]} />

      <div className="mt-7 overflow-hidden rounded-2xl border">
        {dates.length === 0 ? (
          <p className="p-6 text-neutral-600">
            No important dates in the next 90 days.
          </p>
        ) : (
          dates.map((item) => (
            <Link
              key={item.important_date_id}
              href={`/customers/${item.person_id}`}
              className="grid gap-2 border-b p-5 last:border-b-0 hover:bg-neutral-50 sm:grid-cols-4"
            >
              <div className="font-medium">{item.customer_name}</div>
              <div className="text-sm text-neutral-600">
                {item.date_type}
                {item.label ? ` · ${item.label}` : ""}
              </div>
              <div className="text-sm text-neutral-600">
                {new Date(
                  `${item.next_occurrence}T00:00:00`,
                ).toLocaleDateString()}
              </div>
              <div className="text-sm sm:text-right">
                {item.days_until === 0
                  ? "Today"
                  : `${item.days_until} days`}
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
