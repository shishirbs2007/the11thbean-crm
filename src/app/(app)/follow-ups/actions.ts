"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function createFollowUp(formData: FormData) {
  const { supabase, user } = await requireUser();

  const personId = String(formData.get("person_id") || "").trim();
  const title = String(formData.get("title") || "").trim();

  if (!title) return;

  const dueValue = String(formData.get("due_at") || "").trim();

  const { error } = await supabase.from("customer_tasks").insert({
    person_id: personId || null,
    task_type:
      String(formData.get("task_type") || "").trim() || "follow_up",
    title,
    description:
      String(formData.get("description") || "").trim() || null,
    due_at: dueValue ? new Date(dueValue).toISOString() : null,
    priority:
      String(formData.get("priority") || "").trim() || "normal",
    assigned_to: user.id,
    created_by: user.id,
  });

  if (error) {
    redirect(`/follow-ups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/follow-ups");
}

export async function completeFollowUp(id: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("customer_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    redirect(`/follow-ups?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/follow-ups");
}
