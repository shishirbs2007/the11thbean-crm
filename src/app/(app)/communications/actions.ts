"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function createTemplate(formData: FormData) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("communication_templates").insert({
    name: String(formData.get("name") || "").trim(),
    channel: String(formData.get("channel") || "").trim(),
    category: String(formData.get("category") || "").trim() || "marketing",
    subject: String(formData.get("subject") || "").trim() || null,
    body_text: String(formData.get("body_text") || "").trim(),
    created_by: user.id,
  });

  if (error) {
    redirect(`/communications?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/communications");
}

export async function createCampaign(formData: FormData) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("communication_campaigns").insert({
    name: String(formData.get("name") || "").trim(),
    description:
      String(formData.get("description") || "").trim() || null,
    channel: String(formData.get("channel") || "").trim(),
    template_id:
      String(formData.get("template_id") || "").trim() || null,
    segment_id:
      String(formData.get("segment_id") || "").trim() || null,
    created_by: user.id,
  });

  if (error) {
    redirect(`/communications?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/communications");
}
