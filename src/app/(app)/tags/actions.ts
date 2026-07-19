"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function createTag(formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") || "").trim();

  if (!name) return;

  const { error } = await supabase.from("tags").insert({
    name,
    description:
      String(formData.get("description") || "").trim() || null,
  });

  if (error) {
    redirect(`/tags?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/tags");
}
