"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function back(params: string): never {
  redirect(`/briefing?${params}`);
}

export async function completeTask(taskId: string, formData: FormData) {
  const { supabase, user } = await requireUser();

  const outcome = value(formData, "outcome") === "dismissed" ? "dismissed" : "done";

  const { error } = await supabase
    .from("hospitality_tasks")
    .update({
      status: outcome,
      completed_at: new Date().toISOString(),
      completed_by: user.id,
    })
    .eq("id", taskId);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/briefing");
  back(
    outcome === "done"
      ? "success=Nice%20one.%20Marked%20done."
      : "success=Task%20dismissed",
  );
}

export async function addTask(formData: FormData) {
  const { supabase } = await requireUser();

  const title = value(formData, "title");

  if (!title) {
    back("error=Give%20the%20task%20a%20title");
  }

  const { error } = await supabase.from("hospitality_tasks").insert({
    person_id: value(formData, "person_id") || null,
    task_type: "staff_note",
    title,
    detail: value(formData, "detail") || null,
    priority: Number(value(formData, "priority") || 3),
    source: "staff",
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/briefing");
  back("success=Task%20added");
}

export async function saveHandover(formData: FormData) {
  const { supabase, user } = await requireUser();

  const notes = value(formData, "notes");

  if (!notes) {
    back("error=Write%20something%20for%20the%20next%20shift");
  }

  const { error } = await supabase.from("shift_handovers").insert({
    shift_label: value(formData, "shift_label") || "day",
    notes,
    guests_to_watch: value(formData, "guests_to_watch") || null,
    created_by: user.id,
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/briefing");
  back("success=Handover%20saved");
}
