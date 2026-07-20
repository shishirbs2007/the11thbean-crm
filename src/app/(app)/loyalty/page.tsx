import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";
import { applyTransaction, issueGiftCard } from "./actions";

export default async function LoyaltyPage() {
  const { supabase } = await requireUser();

  const [
    accountsResult,
    cardsResult,
    ledgerResult,
    peopleResult,
  ] = await Promise.all([
    supabase
      .from("loyalty_accounts")
      .select(
        "person_id,tier,points_balance,lifetime_points,wallet_balance,last_activity_at,people(first_name,last_name,preferred_name)",
      )
      .order("lifetime_points", { ascending: false })
      .limit(200),
    supabase
      .from("gift_cards")
      .select("*")
      .order("issued_at", { ascending: false })
      .limit(100),
    supabase
      .from("loyalty_ledger")
      .select(
        "id,person_id,transaction_type,points,wallet_amount,description,created_at,people(first_name,last_name,preferred_name)",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("people")
      .select("id,first_name,last_name,preferred_name")
      .eq("is_active", true)
      .order("first_name"),
  ]);

  const accounts = accountsResult.data ?? [];
  const cards = cardsResult.data ?? [];
  const ledger = ledgerResult.data ?? [];
  const people = peopleResult.data ?? [];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Retention"
        title="Loyalty and stored value"
        description="Points, tiers, manual adjustments, wallet balances and gift cards."
      />

      <ErrorPanel messages={[accountsResult.error?.message]} />

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Apply transaction</h2>
          <form action={applyTransaction} className="mt-5 grid gap-3 sm:grid-cols-2">
            <select name="person_id" required className="rounded-xl border px-3 py-2 sm:col-span-2">
              <option value="">Choose customer</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.preferred_name || person.first_name}{" "}
                  {person.last_name || ""}
                </option>
              ))}
            </select>
            <select name="transaction_type" className="rounded-xl border px-3 py-2">
              <option value="earn">Earn points</option>
              <option value="redeem">Redeem points</option>
              <option value="adjustment">Points adjustment</option>
              <option value="expiry">Expire points</option>
              <option value="wallet_credit">Wallet credit</option>
              <option value="wallet_debit">Wallet debit</option>
            </select>
            <input name="points" type="number" step="0.01" placeholder="Points" className="rounded-xl border px-3 py-2" />
            <input name="wallet_amount" type="number" step="0.01" placeholder="Wallet amount" className="rounded-xl border px-3 py-2" />
            <input name="description" placeholder="Reason" className="rounded-xl border px-3 py-2" />
            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Apply transaction
            </button>
          </form>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Issue gift card</h2>
          <form action={issueGiftCard} className="mt-5 grid gap-3 sm:grid-cols-2">
            <input name="code" placeholder="Code, optional" className="rounded-xl border px-3 py-2" />
            <input name="amount" required type="number" min="1" step="0.01" placeholder="Value" className="rounded-xl border px-3 py-2" />
            <select name="owner_person_id" className="rounded-xl border px-3 py-2">
              <option value="">Owner, optional</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.preferred_name || person.first_name}{" "}
                  {person.last_name || ""}
                </option>
              ))}
            </select>
            <select name="purchaser_person_id" className="rounded-xl border px-3 py-2">
              <option value="">Purchaser, optional</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.preferred_name || person.first_name}{" "}
                  {person.last_name || ""}
                </option>
              ))}
            </select>
            <input name="expires_at" type="datetime-local" className="rounded-xl border px-3 py-2" />
            <input name="notes" placeholder="Notes" className="rounded-xl border px-3 py-2" />
            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Issue gift card
            </button>
          </form>
        </section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <div className="mt-5 space-y-3">
            {accounts.map((account) => {
              const person = Array.isArray(account.people)
                ? account.people[0]
                : account.people;
              return (
                <Link key={account.person_id} href={`/customers/${account.person_id}`} className="grid gap-2 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-4">
                  <span className="font-medium">
                    {person?.preferred_name || person?.first_name || "Unknown"}{" "}
                    {person?.last_name || ""}
                  </span>
                  <span className="capitalize">{account.tier}</span>
                  <span>{Number(account.points_balance)} points</span>
                  <span className="sm:text-right">₹{Number(account.wallet_balance).toFixed(0)}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Gift cards</h2>
          <div className="mt-5 space-y-3">
            {cards.map((card) => (
              <div key={card.id} className="grid gap-2 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-3">
                <span className="font-medium">{card.code}</span>
                <span>₹{Number(card.remaining_value).toFixed(0)} remaining</span>
                <span className="capitalize sm:text-right">{card.status}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Recent ledger</h2>
        <div className="mt-5 space-y-3">
          {ledger.map((entry) => {
            const person = Array.isArray(entry.people)
              ? entry.people[0]
              : entry.people;
            return (
              <div key={entry.id} className="grid gap-2 rounded-xl bg-neutral-50 p-4 text-sm sm:grid-cols-5">
                <span>
                  {person?.preferred_name || person?.first_name || "Unknown"}{" "}
                  {person?.last_name || ""}
                </span>
                <span className="capitalize">{entry.transaction_type.replaceAll("_", " ")}</span>
                <span>{Number(entry.points)} points</span>
                <span>₹{Number(entry.wallet_amount).toFixed(0)}</span>
                <span className="sm:text-right">{new Date(entry.created_at).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
