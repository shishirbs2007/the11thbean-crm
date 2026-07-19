"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function createFeedback(formData: FormData) {
  const { supabase } = await requireUser();

  const ratingValue = String(formData.get("rating") || "").trim();

  const { error } = await supabase.from("customer_feedback").insert({
    person_id:
      String(formData.get("person_id") || "").trim() || null,
    rating: ratingValue ? Number(ratingValue) : null,
    feedback_type:
      String(formData.get("feedback_type") || "").trim() || "general",
    message:
      String(formData.get("message") || "").trim() || null,
  });

  if (error) {
    redirect(`/feedback?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/feedback");
}

export async function resolveFeedback(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("customer_feedback")
    .update({
      resolution_status: "resolved",
      resolution_notes:
        String(formData.get("resolution_notes") || "").trim() || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/feedback?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/feedback");
}
