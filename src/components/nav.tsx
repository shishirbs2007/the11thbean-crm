import Link from "next/link";
import { getRole } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

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
];

const labels = {
  admin: "Management",
  manager: "Manager",
  barista: "Barista",
} as const;

export async function Nav() {
  const role = await getRole();

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
        <div className="flex items-center gap-3">
          {role && <span className="text-xs font-medium">{labels[role]}</span>}
          <form action={signOut}>
            <button className="text-xs text-neutral-500 hover:underline">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
