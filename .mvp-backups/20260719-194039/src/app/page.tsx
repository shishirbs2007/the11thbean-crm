import Link from "next/link";

const modules = [
  ["Customer CRM", "Unified people, visits, preferences and hospitality notes"],
  ["POS Connector", "External customer and order identities with sync tracking"],
  ["Communities", "Clubs, memberships and participation"],
  ["Events", "Registrations, attendance and follow-ups"],
  ["Consent", "Communication and data-processing preferences"],
  ["Staff Access", "Role-aware views for baristas and managers"],
];

export default function Home() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-16">
      <p className="mb-3 text-sm font-semibold uppercase tracking-[0.22em]">
        The 11th Bean
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        Hospitality intelligence, without replacing the POS.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600">
        POS runs transactions. This platform joins those transactions to
        relationships, communities, events, preferences and service context.
      </p>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(([name, description]) => (
          <article key={name} className="rounded-2xl border p-5">
            <h2 className="font-semibold">{name}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {description}
            </p>
          </article>
        ))}
      </div>

      <Link
        href="/customers"
        className="mt-10 inline-flex rounded-full bg-black px-5 py-3 text-sm font-medium text-white"
      >
        Open customer workspace
      </Link>
    </main>
  );
}
