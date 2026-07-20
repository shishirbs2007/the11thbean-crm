import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { claimFirstAdmin, signOut } from "./actions";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: role } = await supabase.rpc("current_app_role");

  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <ErrorPanel messages={[error]} />

      <section className="mt-7 rounded-2xl border p-6">
        <h2 className="font-semibold">Your access</h2>
        <p className="mt-2 text-sm text-neutral-600">Email: {user.email}</p>
        <p className="mt-1 text-sm text-neutral-600">Role: {role || "Not assigned"}</p>

        {!role && (
          <form action={claimFirstAdmin} className="mt-5">
            <button className="rounded-xl bg-black px-4 py-3 text-white">
              Claim first administrator role
            </button>
            <p className="mt-2 text-xs text-neutral-500">
              This works only while no active staff roles exist.
            </p>
          </form>
        )}
      </section>

      <form action={signOut} className="mt-6">
        <button className="rounded-xl border px-4 py-3">Sign out</button>
      </form>
    </main>
  );
}
