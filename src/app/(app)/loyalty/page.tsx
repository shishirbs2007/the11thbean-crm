import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/platform/page-header";

export default async function LoyaltyPage() {
  const { supabase } = await requireUser();

  const [
    { data: accountsData, error: accountsError },
    { data: cardsData, error: cardsError },
  ] = await Promise.all([
    supabase
      .from("loyalty_accounts")
      .select(
        "person_id, tier, points_balance, lifetime_points, wallet_balance, people(first_name, last_name, preferred_name)",
      )
      .order("lifetime_points", { ascending: false })
      .limit(100),
    supabase
      .from("gift_cards")
      .select(
        "id, code, original_value, remaining_value, status, expires_at, owner_person_id",
      )
      .order("issued_at", { ascending: false })
      .limit(100),
  ]);

  const accounts = accountsData ?? [];
  const cards = cardsData ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Retention"
        title="Loyalty and gift cards"
        description="Foundations for recognition, stored value and customer rewards."
      />

      {(accountsError || cardsError) && (
        <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">
          {accountsError?.message || cardsError?.message}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Loyalty accounts</h2>
          <div className="mt-5 space-y-3">
            {accounts.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No loyalty accounts yet.
              </p>
            ) : (
              accounts.map((account) => {
                const person = Array.isArray(account.people)
                  ? account.people[0]
                  : account.people;

                return (
                  <Link
                    key={account.person_id}
                    href={`/customers/${account.person_id}`}
                    className="flex justify-between rounded-xl bg-neutral-50 p-4 text-sm"
                  >
                    <span>
                      {person?.preferred_name || person?.first_name || "Unknown"}{" "}
                      {person?.last_name || ""}
                    </span>
                    <span>
                      {account.tier} · {Number(account.points_balance)} points
                    </span>
                  </Link>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Gift cards</h2>
          <div className="mt-5 space-y-3">
            {cards.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No gift cards yet.
              </p>
            ) : (
              cards.map((card) => (
                <div
                  key={card.id}
                  className="flex justify-between rounded-xl bg-neutral-50 p-4 text-sm"
                >
                  <span>{card.code}</span>
                  <span>
                    ₹{Number(card.remaining_value).toFixed(0)} / ₹
                    {Number(card.original_value).toFixed(0)} · {card.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
