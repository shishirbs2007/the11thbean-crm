import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { ArrivalCounter } from "./arrival-counter";

type ArrivalRow = {
  visit_id: string;
  person_id: string;
  greeting_name: string;
  last_name: string | null;
  visited_at: string;
  party_size: number;
  is_new_guest: boolean;
};

export default async function ArrivalPage() {
  const { supabase } = await requireUser();

  const todayResult = await supabase
    .from("arrivals_today")
    .select("*")
    .limit(40);

  const today = (todayResult.data ?? []) as ArrivalRow[];

  return (
    <main className="mx-auto max-w-4xl px-5 py-8">
      <PageHeader
        eyebrow="At the counter"
        title="Arrival"
        description="Recognise a guest in one move. Everything you need to look after them comes with it."
      />

      <ErrorPanel messages={[todayResult.error?.message]} />

      <div className="mt-6">
        <ArrivalCounter />
      </div>

      <div className="mt-8">
        <Section
          title="In today"
          description="Everyone recorded so far this shift."
        >
          {today.length === 0 ? (
            <p className="text-neutral-600">Nobody yet.</p>
          ) : (
            <ul className="space-y-2">
              {today.map((row) => (
                <li
                  key={row.visit_id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <Link
                      href={`/customers/${row.person_id}`}
                      className="font-medium underline"
                    >
                      {row.greeting_name} {row.last_name || ""}
                    </Link>
                    {row.is_new_guest && (
                      <span className="ml-2 text-sm text-neutral-500">
                        first time
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500">
                    {new Date(row.visited_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {row.party_size > 1 && ` · ${row.party_size} people`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </main>
  );
}
