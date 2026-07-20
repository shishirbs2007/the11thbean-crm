import { sendMagicLink } from "./actions";
import { ErrorPanel } from "@/components/notifications/error-panel";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-3xl border p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em]">
          The 11th Bean
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Staff sign in</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Enter your authorised work email. We will send a secure sign-in link.
        </p>

        {params.sent && (
          <p className="mt-5 rounded-xl bg-neutral-100 p-3 text-sm">
            Sign-in link sent. Check your inbox.
          </p>
        )}
        <ErrorPanel messages={[params.error]} />

        <form action={sendMagicLink} className="mt-6 space-y-4">
          <input
            name="email"
            type="email"
            required
            placeholder="you@example.com"
            className="w-full rounded-xl border px-4 py-3"
          />
          <button className="w-full rounded-xl bg-black px-4 py-3 font-medium text-white">
            Send sign-in link
          </button>
        </form>
      </section>
    </main>
  );
}
