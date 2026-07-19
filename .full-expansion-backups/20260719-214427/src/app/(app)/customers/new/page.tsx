import { createPerson } from "../actions";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Add customer</h1>
      {error && <p className="mt-4 text-red-700">{error}</p>}
      <form action={createPerson} className="mt-7 grid gap-4 sm:grid-cols-2">
        <input name="first_name" required placeholder="First name" className="rounded-xl border px-4 py-3" />
        <input name="last_name" placeholder="Last name" className="rounded-xl border px-4 py-3" />
        <input name="preferred_name" placeholder="Preferred name" className="rounded-xl border px-4 py-3" />
        <input name="phone" placeholder="Phone" className="rounded-xl border px-4 py-3" />
        <input name="email" type="email" placeholder="Email" className="rounded-xl border px-4 py-3" />
        <input name="occupation" placeholder="Occupation" className="rounded-xl border px-4 py-3" />
        <input name="company" placeholder="Company" className="rounded-xl border px-4 py-3" />
        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">Create customer</button>
      </form>
    </main>
  );
}
