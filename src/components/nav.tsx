import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { NavMenu } from "@/components/nav-menu";

const primary = [
  ["/briefing", "Today"],
  ["/dashboard", "Dashboard"],
  ["/search", "Search"],
  ["/customers", "Customers"],
  ["/households", "Households"],
  ["/visits", "Visits"],
  ["/follow-ups", "Follow-ups"],
  ["/important-dates", "Important Dates"],
] as const;

const groups = [
  {
    label: "Intelligence",
    links: [
      ["/insights", "Insights"],
      ["/segments", "Segments"],
      ["/loyalty", "Loyalty"],
      ["/feedback", "Feedback"],
    ],
  },
  {
    label: "Community",
    links: [
      ["/communities", "Communities"],
      ["/events", "Events"],
      ["/communications", "Communications"],
      ["/audiences", "Audiences"],
      ["/campaigns", "Campaigns"],
    ],
  },
  {
    label: "Admin",
    links: [
      ["/operations", "Operations"],
      ["/integrations", "Integrations"],
      ["/tags", "Tags"],
      ["/staff", "Staff"],
      ["/audit", "Audit"],
      ["/settings", "Settings"],
    ],
  },
] as const;

export async function Nav() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-30 border-b bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-5 py-4">
        <Link
          href="/dashboard"
          className="mr-auto font-semibold tracking-wide"
        >
          THE 11TH BEAN
        </Link>

        <nav className="text-sm">
          <NavMenu primary={primary} groups={groups} />
        </nav>

        <span className="hidden text-xs text-neutral-500 xl:block">
          {user?.email}
        </span>
      </div>
    </header>
  );
}
