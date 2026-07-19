import Link from "next/link";

const modules = [
  ["Customer CRM", "Identity, preferences, notes and relationship timelines"],
  ["Communities", "Clubs, memberships and participation"],
  ["Events", "Programming, registrations and attendance history"],
  ["Staff Access", "Secure magic-link access with role-aware permissions"],
  ["Consent", "A foundation for communication and data preferences"],
  ["POS Connector", "Provider-neutral integration layer, ready for later"],
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em]">The 11th Bean</p>
      <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Hospitality intelligence, built around relationships.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
        A staff platform for recognising customers, running communities and events,
        and preserving the café&apos;s relationship memory.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(([name, description]) => (
          <article key={name} className="rounded-2xl border p-5">
            <h2 className="font-semibold">{name}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">{description}</p>
          </article>
        ))}
      </div>

      <Link href="/login" className="mt-10 inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white">
        Staff sign in
      </Link>
    </main>
  );
}
