import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "barista" | "manager" | "admin";

export async function getRole(): Promise<AppRole | null> {
  const cookieStore = await cookies();
  const role = cookieStore.get("bean_role")?.value;

  if (role === "barista" || role === "manager" || role === "admin") return role;
  return null;
}

export async function requireUser() {
  const role = await getRole();
  if (!role) redirect("/login");

  const supabase = await createClient();
  return { supabase, role };
}

export async function requireManager() {
  const role = await getRole();
  if (!role) redirect("/login");
  if (role !== "manager" && role !== "admin") redirect("/dashboard");
  return role;
}

export async function requireAdmin() {
  const role = await getRole();
  if (!role) redirect("/login");
  if (role !== "admin") redirect("/dashboard");
  return role;
}
