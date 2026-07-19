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
