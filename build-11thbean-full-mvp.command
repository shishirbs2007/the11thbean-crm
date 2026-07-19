#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

VERSION="1.0.0"
START_DIR="$(pwd)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR=""
LOG_FILE=""

C_RESET=$'\033[0m'
C_BOLD=$'\033[1m'
C_GREEN=$'\033[32m'
C_YELLOW=$'\033[33m'
C_RED=$'\033[31m'
C_CYAN=$'\033[36m'

info() { printf "%s[INFO]%s %s\n" "$C_CYAN" "$C_RESET" "$*"; }
pass() { printf "%s[PASS]%s %s\n" "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf "%s[WARN]%s %s\n" "$C_YELLOW" "$C_RESET" "$*"; }
fail() { printf "%s[FAIL]%s %s\n" "$C_RED" "$C_RESET" "$*"; }
die() { fail "$*"; [[ -n "$LOG_FILE" ]] && printf "Log: %s\n" "$LOG_FILE"; exit 1; }

on_error() {
  local code=$?
  fail "Expansion stopped at line ${1:-unknown}, exit code $code."
  [[ -n "$BACKUP_DIR" ]] && printf "Backup: %s\n" "$BACKUP_DIR"
  [[ -n "$LOG_FILE" ]] && printf "Log: %s\n" "$LOG_FILE"
  printf "The script can be rerun after the reported issue is resolved.\n"
  exit "$code"
}
trap 'on_error $LINENO' ERR

find_project_root() {
  local current="$START_DIR"
  local depth=0
  while [[ "$current" != "/" && $depth -lt 8 ]]; do
    if [[ -f "$current/package.json" && -d "$current/src/app" && -d "$current/supabase" ]]; then
      printf "%s" "$current"
      return 0
    fi
    local found
    found="$(find "$current" -maxdepth 3 -type f -name package.json 2>/dev/null | while read -r f; do
      d="$(dirname "$f")"
      [[ -d "$d/src/app" && -d "$d/supabase" ]] && { printf "%s\n" "$d"; break; }
    done)"
    if [[ -n "$found" ]]; then
      printf "%s" "$found"
      return 0
    fi
    current="$(dirname "$current")"
    depth=$((depth + 1))
  done
  return 1
}

PROJECT_ROOT="$(find_project_root || true)"
[[ -n "$PROJECT_ROOT" ]] || die "Could not find the CRM project. Put this file inside the project folder and rerun it."

cd "$PROJECT_ROOT"
LOG_FILE="$PROJECT_ROOT/MVP_BUILD_LOG_${TIMESTAMP}.txt"
exec > >(tee -a "$LOG_FILE") 2>&1

clear
printf "%sThe 11th Bean Full MVP Builder%s\n" "$C_BOLD" "$C_RESET"
printf "Version %s\n\n" "$VERSION"
printf "Project: %s\n\n" "$PROJECT_ROOT"

for command_name in node npm git gh supabase vercel curl; do
  command -v "$command_name" >/dev/null 2>&1 || die "$command_name is unavailable."
done

gh auth status >/dev/null 2>&1 || die "GitHub CLI is not authenticated."
supabase projects list >/dev/null 2>&1 || die "Supabase CLI is not authenticated."
vercel whoami >/dev/null 2>&1 || die "Vercel CLI is not authenticated."
[[ -f .vercel/project.json ]] || die "This folder is not linked to Vercel."
[[ -f supabase/.temp/project-ref || -f .supabase/project-ref ]] || warn "Supabase link metadata was not found in the usual location; db push will confirm linkage."

BACKUP_DIR="$PROJECT_ROOT/.mvp-backups/$TIMESTAMP"
mkdir -p "$BACKUP_DIR"
info "Creating source backup..."
for path in src supabase package.json package-lock.json next.config.ts; do
  [[ -e "$path" ]] && cp -R "$path" "$BACKUP_DIR/"
done
pass "Backup created at $BACKUP_DIR"

info "Installing required packages..."
npm install @supabase/ssr @supabase/supabase-js zod

mkdir -p \
  src/app/auth/callback \
  src/app/login \
  'src/app/(app)/customers/new' \
  'src/app/(app)/customers/[id]' \
  'src/app/(app)/communities' \
  'src/app/(app)/events' \
  'src/app/(app)/settings' \
  'src/app/(app)' \
  src/components \
  src/lib/supabase \
  src/lib \
  supabase/migrations

cat > src/lib/supabase/server.ts <<'EOF'
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Components cannot always write cookies.
            // The proxy refreshes sessions for normal requests.
          }
        },
      },
    },
  );
}
EOF

cat > src/lib/supabase/client.ts <<'EOF'
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
EOF

cat > src/lib/supabase/proxy.ts <<'EOF'
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/health");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
EOF

cat > src/proxy.ts <<'EOF'
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
EOF

cat > src/lib/auth.ts <<'EOF'
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export async function getRole() {
  const { supabase } = await requireUser();
  const { data } = await supabase.rpc("current_app_role");
  return data as "barista" | "manager" | "admin" | null;
}

export async function requireManager() {
  const role = await getRole();
  if (role !== "manager" && role !== "admin") redirect("/dashboard");
  return role;
}
EOF

cat > src/app/auth/callback/route.ts <<'EOF'
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
EOF

cat > src/app/login/actions.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function sendMagicLink(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) redirect("/login?error=Enter%20an%20email%20address");

  const supabase = await createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^/, "https://") ||
    "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback?next=/settings`,
    },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/login?sent=1");
}
EOF

cat > src/app/login/page.tsx <<'EOF'
import { sendMagicLink } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <section className="w-full rounded-3xl border p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em]">The 11th Bean</p>
        <h1 className="mt-3 text-3xl font-semibold">Staff sign in</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          Enter your authorised work email. We will send a secure sign-in link.
        </p>

        {params.sent && (
          <p className="mt-5 rounded-xl bg-neutral-100 p-3 text-sm">
            Sign-in link sent. Check your inbox.
          </p>
        )}
        {params.error && (
          <p className="mt-5 rounded-xl border border-red-300 p-3 text-sm text-red-700">
            {params.error}
          </p>
        )}

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
EOF

cat > src/components/nav.tsx <<'EOF'
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const links = [
  ["/dashboard", "Dashboard"],
  ["/customers", "Customers"],
  ["/communities", "Communities"],
  ["/events", "Events"],
  ["/settings", "Settings"],
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
EOF

cat > src/app/'(app)'/layout.tsx <<'EOF'
import { Nav } from "@/components/nav";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireUser();

  return (
    <>
      <Nav />
      {children}
    </>
  );
}
EOF

cat > src/app/'(app)'/page.tsx <<'EOF'
import { redirect } from "next/navigation";

export default function AppPage() {
  redirect("/dashboard");
}
EOF

mkdir -p src/app/'(app)'/dashboard
cat > src/app/'(app)'/dashboard/page.tsx <<'EOF'
import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { supabase } = await requireUser();

  const [
    { count: people },
    { count: communities },
    { count: events },
    { count: visits },
  ] = await Promise.all([
    supabase.from("people").select("*", { count: "exact", head: true }),
    supabase.from("communities").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("visits").select("*", { count: "exact", head: true }),
  ]);

  const cards = [
    ["Customers", people ?? 0, "/customers"],
    ["Visits", visits ?? 0, "/customers"],
    ["Communities", communities ?? 0, "/communities"],
    ["Events", events ?? 0, "/events"],
  ];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-neutral-600">The café relationship layer at a glance.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value, href]) => (
          <Link key={String(label)} href={String(href)} className="rounded-2xl border p-5">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{value}</p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold">Start here</h2>
        <p className="mt-2 text-sm text-neutral-600">
          Claim the first admin role in Settings, then add customers, communities and events.
        </p>
      </div>
    </main>
  );
}
EOF

cat > src/app/'(app)'/customers/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const PersonSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().optional(),
  preferred_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  occupation: z.string().trim().optional(),
  company: z.string().trim().optional(),
});

export async function createPerson(formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = PersonSchema.parse(Object.fromEntries(formData));

  const { data, error } = await supabase
    .from("people")
    .insert({
      ...parsed,
      last_name: parsed.last_name || null,
      preferred_name: parsed.preferred_name || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      occupation: parsed.occupation || null,
      company: parsed.company || null,
    })
    .select("id")
    .single();

  if (error) redirect(`/customers/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/customers");
  redirect(`/customers/${data.id}`);
}

export async function updatePerson(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = PersonSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("people")
    .update({
      ...parsed,
      last_name: parsed.last_name || null,
      preferred_name: parsed.preferred_name || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      occupation: parsed.occupation || null,
      company: parsed.company || null,
    })
    .eq("id", id);

  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
}

export async function addNote(id: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const note = String(formData.get("note") || "").trim();
  const visibility = String(formData.get("visibility") || "barista");
  if (!note) return;

  const { error } = await supabase.from("customer_notes").insert({
    person_id: id,
    note,
    visibility,
    created_by: user.id,
  });

  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/customers/${id}`);
}

export async function addPreference(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const preference_type = String(formData.get("preference_type") || "").trim();
  const preference_value = String(formData.get("preference_value") || "").trim();
  if (!preference_type || !preference_value) return;

  const { error } = await supabase.from("customer_preferences").upsert({
    person_id: id,
    preference_type,
    preference_value,
    source: "staff",
  });

  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/customers/${id}`);
}
EOF

cat > src/app/'(app)'/customers/page.tsx <<'EOF'
import Link from "next/link";
import { requireUser } from "@/lib/auth";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { supabase } = await requireUser();
  const { q = "" } = await searchParams;

  let query = supabase
    .from("people")
    .select("id, first_name, last_name, preferred_name, phone, email, company, customer_status, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(100);

  if (q.trim()) {
    const term = q.trim().replaceAll(",", " ");
    query = query.or(
      `first_name.ilike.%${term}%,last_name.ilike.%${term}%,preferred_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`,
    );
  }

  const { data: people = [], error } = await query;

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Customers</h1>
          <p className="mt-2 text-neutral-600">Search and build a complete hospitality profile.</p>
        </div>
        <Link href="/customers/new" className="rounded-xl bg-black px-4 py-3 text-sm text-white">
          Add customer
        </Link>
      </div>

      <form className="mt-7 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name, phone, email or company"
          className="w-full rounded-xl border px-4 py-3"
        />
        <button className="rounded-xl border px-5">Search</button>
      </form>

      {error && <p className="mt-5 text-red-700">{error.message}</p>}

      <div className="mt-6 overflow-hidden rounded-2xl border">
        {people.length === 0 ? (
          <p className="p-6 text-neutral-600">No matching customers yet.</p>
        ) : (
          people.map((person) => (
            <Link
              key={person.id}
              href={`/customers/${person.id}`}
              className="grid gap-1 border-b p-5 last:border-b-0 hover:bg-neutral-50 sm:grid-cols-3"
            >
              <div className="font-medium">
                {person.preferred_name || person.first_name} {person.last_name || ""}
              </div>
              <div className="text-sm text-neutral-600">{person.phone || person.email || "No contact"}</div>
              <div className="text-sm text-neutral-500 sm:text-right">{person.company || person.customer_status}</div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
EOF

cat > src/app/'(app)'/customers/new/page.tsx <<'EOF'
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
EOF

cat > src/app/'(app)'/customers/'[id]'/page.tsx <<'EOF'
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { addNote, addPreference, updatePerson } from "../actions";

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const { supabase } = await requireUser();

  const [
    { data: person },
    { data: notes = [] },
    { data: preferences = [] },
    { data: visits = [] },
    { data: memberships = [] },
    { data: registrations = [] },
  ] = await Promise.all([
    supabase.from("people").select("*").eq("id", id).single(),
    supabase.from("customer_notes").select("*").eq("person_id", id).order("created_at", { ascending: false }),
    supabase.from("customer_preferences").select("*").eq("person_id", id).order("created_at", { ascending: false }),
    supabase.from("visits").select("*").eq("person_id", id).order("visited_at", { ascending: false }).limit(20),
    supabase.from("community_memberships").select("role, joined_at, communities(name)").eq("person_id", id),
    supabase.from("event_registrations").select("status, registered_at, events(name, starts_at)").eq("person_id", id),
  ]);

  if (!person) notFound();
  const update = updatePerson.bind(null, id);
  const noteAction = addNote.bind(null, id);
  const preferenceAction = addPreference.bind(null, id);

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">Customer profile</p>
        <h1 className="mt-2 text-3xl font-semibold">
          {person.preferred_name || person.first_name} {person.last_name || ""}
        </h1>
        <p className="mt-2 text-neutral-600">
          {visits.length} recorded visits · {memberships.length} communities · {registrations.length} events
        </p>
      </div>

      {error && <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">{error}</p>}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Identity</h2>
          <form action={update} className="mt-5 grid gap-3 sm:grid-cols-2">
            <input name="first_name" required defaultValue={person.first_name} className="rounded-xl border px-3 py-2" />
            <input name="last_name" defaultValue={person.last_name || ""} placeholder="Last name" className="rounded-xl border px-3 py-2" />
            <input name="preferred_name" defaultValue={person.preferred_name || ""} placeholder="Preferred name" className="rounded-xl border px-3 py-2" />
            <input name="phone" defaultValue={person.phone || ""} placeholder="Phone" className="rounded-xl border px-3 py-2" />
            <input name="email" type="email" defaultValue={person.email || ""} placeholder="Email" className="rounded-xl border px-3 py-2" />
            <input name="occupation" defaultValue={person.occupation || ""} placeholder="Occupation" className="rounded-xl border px-3 py-2" />
            <input name="company" defaultValue={person.company || ""} placeholder="Company" className="rounded-xl border px-3 py-2" />
            <button className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">Save profile</button>
          </form>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Hospitality preferences</h2>
          <form action={preferenceAction} className="mt-5 grid gap-3 sm:grid-cols-2">
            <input name="preference_type" required placeholder="Type, e.g. seating" className="rounded-xl border px-3 py-2" />
            <input name="preference_value" required placeholder="Preference" className="rounded-xl border px-3 py-2" />
            <button className="rounded-xl border px-4 py-2 sm:col-span-2">Add preference</button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            {preferences.map((item) => (
              <span key={item.id} className="rounded-full bg-neutral-100 px-3 py-1 text-sm">
                {item.preference_type}: {item.preference_value}
              </span>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Notes</h2>
          <form action={noteAction} className="mt-5 space-y-3">
            <textarea name="note" required placeholder="Useful hospitality context" className="min-h-24 w-full rounded-xl border p-3" />
            <select name="visibility" className="w-full rounded-xl border p-3">
              <option value="barista">Visible to baristas</option>
              <option value="manager">Managers only</option>
              <option value="private">Private</option>
            </select>
            <button className="rounded-xl border px-4 py-2">Add note</button>
          </form>
          <div className="mt-5 space-y-3">
            {notes.map((note) => (
              <article key={note.id} className="rounded-xl bg-neutral-50 p-4">
                <p>{note.note}</p>
                <p className="mt-2 text-xs text-neutral-500">{note.visibility} · {new Date(note.created_at).toLocaleString()}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Relationship timeline</h2>
          <div className="mt-5 space-y-4 text-sm">
            {visits.map((visit) => (
              <div key={visit.id}>
                <p className="font-medium">Visit · {new Date(visit.visited_at).toLocaleDateString()}</p>
                <p className="text-neutral-500">{visit.net_amount ? `₹${visit.net_amount}` : visit.source}</p>
              </div>
            ))}
            {memberships.map((membership, index) => (
              <div key={`m-${index}`}>
                <p className="font-medium">Community · {(membership.communities as { name?: string } | null)?.name}</p>
                <p className="text-neutral-500">{membership.role}</p>
              </div>
            ))}
            {registrations.map((registration, index) => (
              <div key={`e-${index}`}>
                <p className="font-medium">Event · {(registration.events as { name?: string } | null)?.name}</p>
                <p className="text-neutral-500">{registration.status}</p>
              </div>
            ))}
            {!visits.length && !memberships.length && !registrations.length && (
              <p className="text-neutral-500">No timeline activity yet.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
EOF

cat > src/app/'(app)'/communities/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createCommunity(formData: FormData) {
  await requireManager();
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!name) return;

  const { error } = await supabase.from("communities").insert({ name, description: description || null });
  if (error) redirect(`/communities?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/communities");
}
EOF

cat > src/app/'(app)'/communities/page.tsx <<'EOF'
import { requireUser } from "@/lib/auth";
import { createCommunity } from "./actions";

export default async function CommunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: queryError } = await searchParams;
  const { supabase } = await requireUser();
  const { data: communities = [] } = await supabase
    .from("communities")
    .select("id, name, description, is_active, community_memberships(count)")
    .order("name");

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Communities</h1>
      <p className="mt-2 text-neutral-600">Clubs, circles and recurring groups around the café.</p>
      {queryError && <p className="mt-4 text-red-700">{queryError}</p>}

      <form action={createCommunity} className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2">
        <input name="name" required placeholder="Community name" className="rounded-xl border px-4 py-3" />
        <input name="description" placeholder="Description" className="rounded-xl border px-4 py-3" />
        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">Create community</button>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {communities.map((community) => (
          <article key={community.id} className="rounded-2xl border p-5">
            <h2 className="font-semibold">{community.name}</h2>
            <p className="mt-2 text-sm text-neutral-600">{community.description || "No description"}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
EOF

cat > src/app/'(app)'/events/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createEvent(formData: FormData) {
  await requireManager();
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const starts_at = String(formData.get("starts_at") || "");
  const location = String(formData.get("location") || "").trim();
  const capacityRaw = String(formData.get("capacity") || "").trim();

  const { error } = await supabase.from("events").insert({
    name,
    starts_at: new Date(starts_at).toISOString(),
    location: location || null,
    capacity: capacityRaw ? Number(capacityRaw) : null,
  });

  if (error) redirect(`/events?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/events");
}
EOF

cat > src/app/'(app)'/events/page.tsx <<'EOF'
import { requireUser } from "@/lib/auth";
import { createEvent } from "./actions";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: queryError } = await searchParams;
  const { supabase } = await requireUser();
  const { data: events = [] } = await supabase
    .from("events")
    .select("id, name, starts_at, location, capacity, event_registrations(count)")
    .order("starts_at", { ascending: false });

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <h1 className="text-3xl font-semibold">Events</h1>
      <p className="mt-2 text-neutral-600">Registrations, attendance and event history.</p>
      {queryError && <p className="mt-4 text-red-700">{queryError}</p>}

      <form action={createEvent} className="mt-7 grid gap-3 rounded-2xl border p-5 sm:grid-cols-2">
        <input name="name" required placeholder="Event name" className="rounded-xl border px-4 py-3" />
        <input name="starts_at" required type="datetime-local" className="rounded-xl border px-4 py-3" />
        <input name="location" placeholder="Location" className="rounded-xl border px-4 py-3" />
        <input name="capacity" min="1" type="number" placeholder="Capacity" className="rounded-xl border px-4 py-3" />
        <button className="rounded-xl bg-black px-4 py-3 text-white sm:col-span-2">Create event</button>
      </form>

      <div className="mt-6 space-y-3">
        {events.map((event) => (
          <article key={event.id} className="rounded-2xl border p-5">
            <h2 className="font-semibold">{event.name}</h2>
            <p className="mt-2 text-sm text-neutral-600">
              {new Date(event.starts_at).toLocaleString()} · {event.location || "Location pending"}
            </p>
          </article>
        ))}
      </div>
    </main>
  );
}
EOF

cat > src/app/'(app)'/settings/actions.ts <<'EOF'
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function claimFirstAdmin() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_first_admin");
  if (error) redirect(`/settings?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/settings");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
EOF

cat > src/app/'(app)'/settings/page.tsx <<'EOF'
import { requireUser } from "@/lib/auth";
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
      {error && <p className="mt-5 rounded-xl border border-red-300 p-3 text-red-700">{error}</p>}

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
EOF

cat > src/app/page.tsx <<'EOF'
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
EOF

cat > supabase/migrations/202607190002_full_mvp.sql <<'EOF'
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists people_set_updated_at on public.people;
create trigger people_set_updated_at
before update on public.people
for each row execute function public.set_updated_at();

drop trigger if exists external_identities_set_updated_at on public.external_identities;
create trigger external_identities_set_updated_at
before update on public.external_identities
for each row execute function public.set_updated_at();

drop trigger if exists preferences_set_updated_at on public.customer_preferences;
create trigger preferences_set_updated_at
before update on public.customer_preferences
for each row execute function public.set_updated_at();

create or replace function public.claim_first_admin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  active_roles integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select count(*) into active_roles from public.app_roles where is_active = true;

  if active_roles > 0 then
    raise exception 'An administrator already exists';
  end if;

  insert into public.app_roles(user_id, role, is_active)
  values (auth.uid(), 'admin', true)
  on conflict (user_id)
  do update set role = 'admin', is_active = true;

  return 'admin';
end;
$$;

revoke all on function public.claim_first_admin() from public;
grant execute on function public.claim_first_admin() to authenticated;
grant execute on function public.current_app_role() to authenticated;

drop policy if exists "managers can modify people" on public.people;
create policy "staff can create people"
on public.people for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can update people"
on public.people for update to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'))
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can delete people"
on public.people for delete to authenticated
using (public.current_app_role() in ('manager', 'admin'));

create policy "managers manage external identities"
on public.external_identities for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can create visits"
on public.visits for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can update visits"
on public.visits for update to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can create order items"
on public.order_items for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can create preferences"
on public.customer_preferences for insert to authenticated
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "staff can update preferences"
on public.customer_preferences for update to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'))
with check (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can manage tags"
on public.tags for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "staff can read person tags"
on public.person_tags for select to authenticated
using (public.current_app_role() in ('barista', 'manager', 'admin'));

create policy "managers can manage person tags"
on public.person_tags for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can create communities"
on public.communities for insert to authenticated
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can update communities"
on public.communities for update to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can manage memberships"
on public.community_memberships for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can create events"
on public.events for insert to authenticated
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can update events"
on public.events for update to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can manage event registrations"
on public.event_registrations for all to authenticated
using (public.current_app_role() in ('manager', 'admin'))
with check (public.current_app_role() in ('manager', 'admin'));

create policy "managers can create consents"
on public.consents for insert to authenticated
with check (public.current_app_role() in ('manager', 'admin'));

create policy "admins manage roles"
on public.app_roles for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create index if not exists people_name_idx
on public.people(lower(first_name), lower(last_name));

create index if not exists people_phone_idx on public.people(phone);
create index if not exists people_email_idx on public.people(lower(email));
create index if not exists events_starts_at_idx on public.events(starts_at desc);
EOF

# Add production site URL so magic-link callbacks return to the production app.
PROD_URL="$(vercel ls 2>/dev/null | grep -Eo 'https://[A-Za-z0-9._-]+\.vercel\.app' | head -1 || true)"
if [[ -n "$PROD_URL" ]]; then
  vercel env rm NEXT_PUBLIC_SITE_URL production --yes >/dev/null 2>&1 || true
  printf "%s" "$PROD_URL" | vercel env add NEXT_PUBLIC_SITE_URL production >/dev/null
  vercel env rm NEXT_PUBLIC_SITE_URL preview --yes >/dev/null 2>&1 || true
  printf "%s" "$PROD_URL" | vercel env add NEXT_PUBLIC_SITE_URL preview >/dev/null
  pass "Configured NEXT_PUBLIC_SITE_URL"
else
  warn "Could not identify an existing deployment URL. Magic links may use the Vercel system URL."
fi

info "Applying database migration..."
supabase db push
pass "Database migration applied"

info "Running lint..."
npm run lint
pass "Lint passed"

info "Running production build..."
npm run build
pass "Build passed"

# Keep generated reports and backups out of Git.
cat >> .gitignore <<'EOF'

# Local platform tooling
VALIDATION_REPORT_*.txt
VALIDATION_LOG_*.txt
MVP_BUILD_LOG_*.txt
validate-11thbean-platform.command
build-11thbean-full-mvp.command
.mvp-backups/
EOF

git add .
if git diff --cached --quiet; then
  warn "No source changes were detected for commit."
else
  git commit -m "Build full hospitality CRM MVP"
  git push
  pass "Changes committed and pushed to GitHub"
fi

info "Deploying to Vercel production..."
DEPLOY_OUTPUT="$(vercel --prod --yes)"
printf "%s\n" "$DEPLOY_OUTPUT"
DEPLOY_URL="$(printf "%s\n" "$DEPLOY_OUTPUT" | grep -Eo 'https://[A-Za-z0-9._-]+\.vercel\.app' | tail -1 || true)"
[[ -n "$DEPLOY_URL" ]] || DEPLOY_URL="$PROD_URL"
pass "Production deployment completed${DEPLOY_URL:+: $DEPLOY_URL}"

info "Running smoke tests..."
if [[ -n "$DEPLOY_URL" ]]; then
  for endpoint in "/" "/login" "/api/health"; do
    code="$(curl --compressed -L -sS -o /dev/null -w "%{http_code}" --max-time 30 "${DEPLOY_URL}${endpoint}")"
    if [[ "$code" == "200" ]]; then
      pass "${endpoint} returned HTTP 200"
    else
      fail "${endpoint} returned HTTP $code"
    fi
  done

  protected_code="$(curl --compressed -sS -o /dev/null -w "%{http_code}" --max-time 30 "${DEPLOY_URL}/dashboard")"
  if [[ "$protected_code" == "307" || "$protected_code" == "302" || "$protected_code" == "303" ]]; then
    pass "/dashboard correctly redirects unauthenticated users"
  else
    warn "/dashboard returned HTTP $protected_code; inspect authentication redirect behaviour"
  fi
fi

REPORT="$PROJECT_ROOT/MVP_BUILD_REPORT_${TIMESTAMP}.txt"
cat > "$REPORT" <<EOF
THE 11TH BEAN FULL MVP BUILD REPORT
Generated: $(date)
Builder version: $VERSION

Project: $PROJECT_ROOT
Backup: $BACKUP_DIR
Log: $LOG_FILE
Deployment: ${DEPLOY_URL:-Unknown}

DELIVERED
- Magic-link staff authentication
- Session-refresh proxy and protected application area
- First-user administrator claim
- Staff navigation
- Dashboard counts
- Customer search and listing
- Customer creation and editing
- Customer notes with visibility levels
- Hospitality preferences
- Relationship timeline
- Communities listing and creation
- Events listing and creation
- Expanded database policies and indexes
- GitHub commit and push
- Vercel production deployment
- Automated smoke tests

NEXT USE
1. Open ${DEPLOY_URL:-the production deployment}/login
2. Enter your authorised email.
3. Open the sign-in link received by email.
4. Go to Settings.
5. Click "Claim first administrator role".
6. Begin adding customers, communities and events.

DEFERRED UNTIL LATER
- POS integration
- WhatsApp and outbound email campaigns
- Customer self-service portal
- Bulk imports
- Advanced reports and AI insights
- Native mobile application
EOF

pass "MVP build completed"
printf "\nReport: %s\n" "$REPORT"
printf "Log: %s\n" "$LOG_FILE"
[[ -n "$DEPLOY_URL" ]] && printf "Open: %s/login\n" "$DEPLOY_URL"

open "$REPORT" >/dev/null 2>&1 || true
[[ -n "$DEPLOY_URL" ]] && open "${DEPLOY_URL}/login" >/dev/null 2>&1 || true

printf "\nPress Enter to close..."
read -r
