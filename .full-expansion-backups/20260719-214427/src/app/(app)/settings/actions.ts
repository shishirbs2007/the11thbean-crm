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
