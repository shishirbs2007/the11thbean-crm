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
