import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const links = [
  ["/dashboard", "Dashboard"],
  ["/search", "Search"],
  ["/customers", "Customers"],
  ["/tags", "Tags"],
  ["/households", "Households"],
  ["/communities", "Communities"],
  ["/events", "Events"],
  ["/insights", "Insights"],
  ["/settings", "Settings"],
  ["/communications", "Communications"],
  ["/follow-ups", "Follow-ups"],
  ["/important-dates", "Important Dates"],
  ["/feedback", "Feedback"],
  ["/loyalty", "Loyalty"],
  ["/segments", "Segments"],
  ["/operations", "Operations"],
  ["/integrations", "Integrations"],
  ["/staff", "Staff"],
  ["/audit", "Audit"],
];

export async function Nav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <Link href="/dashboard" className="font-semibold tracking-wide">
          THE 11TH BEAN
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="hover:underline">
              {label}
            </Link>
          ))}
        </nav>
        <span className="text-xs text-neutral-500">{user?.email}</span>
      </div>
    </header>
  );
}
