import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const primary = [
  ["/dashboard", "Dashboard"],
  ["/search", "Search"],
  ["/customers", "Customers"],
  ["/households", "Households"],
  ["/visits", "Visits"],
  ["/follow-ups", "Follow-ups"],
  ["/important-dates", "Important Dates"],
];

const intelligence = [
  ["/insights", "Insights"],
  ["/segments", "Segments"],
  ["/loyalty", "Loyalty"],
  ["/feedback", "Feedback"],
];

const community = [
  ["/communities", "Communities"],
  ["/events", "Events"],
  ["/communications", "Communications"],
];

const admin = [
  ["/operations", "Operations"],
  ["/integrations", "Integrations"],
  ["/tags", "Tags"],
  ["/staff", "Staff"],
  ["/audit", "Audit"],
  ["/settings", "Settings"],
];

function NavGroup({
  label,
  links,
}: {
  label: string;
  links: string[][];
}) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-lg px-2 py-1 hover:bg-neutral-100">
        {label}
      </summary>
      <div className="absolute right-0 z-20 mt-2 min-w-52 rounded-xl border bg-white p-2 shadow-lg">
        {links.map(([href, text]) => (
          <Link
            key={href}
            href={href}
            className="block rounded-lg px-3 py-2 hover:bg-neutral-100"
          >
            {text}
          </Link>
        ))}
      </div>
    </details>
  );
}

export async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-4">
        <Link href="/dashboard" className="mr-auto font-semibold tracking-wide">
          THE 11TH BEAN
        </Link>

        <nav className="flex flex-wrap items-center gap-2 text-sm">
          {primary.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-2 py-1 hover:bg-neutral-100">
              {label}
            </Link>
          ))}
          <NavGroup label="Intelligence" links={intelligence} />
          <NavGroup label="Community" links={community} />
          <NavGroup label="Admin" links={admin} />
        </nav>

        <span className="hidden text-xs text-neutral-500 xl:block">
          {user?.email}
        </span>
      </div>
    </header>
  );
}
