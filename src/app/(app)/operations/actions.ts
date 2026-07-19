"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, requireManager } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export async function createChecklist(formData: FormData) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("operational_checklists")
    .insert({
      name: value(formData, "name"),
      checklist_type: value(formData, "checklist_type") || "daily",
      description: value(formData, "description") || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/operations?error=${encodeURIComponent(error.message)}`);
  }

  const items = value(formData, "items")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length) {
    const { error: itemError } = await supabase
      .from("operational_checklist_items")
      .insert(
        items.map((item, index) => ({
          checklist_id: data.id,
          item_text: item,
          sort_order: index + 1,
          role_scope: value(formData, "role_scope") || "all",
        })),
      );

    if (itemError) {
      redirect(`/operations?error=${encodeURIComponent(itemError.message)}`);
    }
  }

  revalidatePath("/operations");
  redirect("/operations?success=Checklist%20created");
}

export async function startRun(
  checklistId: string,
  formData: FormData,
) {
  const { supabase, user } = await requireUser();

  const { data: checklistItems, error: itemReadError } = await supabase
    .from("operational_checklist_items")
    .select("id,item_text,sort_order")
    .eq("checklist_id", checklistId)
    .order("sort_order");

  if (itemReadError) {
    redirect(`/operations?error=${encodeURIComponent(itemReadError.message)}`);
  }

  const { data: run, error } = await supabase
    .from("operational_runs")
    .insert({
      checklist_id: checklistId,
      business_date:
        value(formData, "business_date") ||
        new Date().toISOString().slice(0, 10),
      shift_name: value(formData, "shift_name") || null,
      started_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/operations?error=${encodeURIComponent(error.message)}`);
  }

  if ((checklistItems ?? []).length) {
    const { error: copyError } = await supabase
      .from("operational_run_items")
      .insert(
        (checklistItems ?? []).map((item) => ({
          run_id: run.id,
          checklist_item_id: item.id,
          is_complete: false,
        })),
      );

    if (copyError) {
      redirect(`/operations?error=${encodeURIComponent(copyError.message)}`);
    }
  }

  revalidatePath("/operations");
  redirect("/operations?success=Checklist%20run%20started");
}

export async function completeRunItem(
  itemId: string,
  status: string,
) {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("operational_run_items")
    .update({
      is_complete: status === "completed",
      notes: status === "issue" ? "Issue reported" : null,
      completed_by: user.id,
      completed_at:
        status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", itemId);

  if (error) {
    redirect(`/operations?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/operations");
}
