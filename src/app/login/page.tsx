import { verifyPin } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-3xl border p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em]">The 11th Bean</p>
        <h1 className="mt-3 text-3xl font-semibold">Welcome back</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">Enter your PIN to continue.</p>

        {params.error && (
          <p className="mt-5 rounded-xl border border-red-300 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

        <form action={verifyPin} className="mt-6 space-y-4">
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            required
            autoFocus
            placeholder="PIN"
            className="w-full rounded-xl border px-4 py-3 text-center text-2xl tracking-[0.4em]"
          />
          <button className="w-full rounded-xl bg-black px-4 py-3 font-medium text-white">
            Continue
          </button>
        </form>
      </section>
    </main>
  );
}
