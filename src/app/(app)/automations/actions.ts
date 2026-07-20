"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function back(params: string): never {
  redirect(`/automations?${params}`);
}

export async function setAutomationState(
  automationId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("hospitality_automations")
    .update({
      is_active: value(formData, "is_active") === "true",
      run_interval_hours: Number(value(formData, "run_interval_hours") || 24),
      updated_at: new Date().toISOString(),
    })
    .eq("id", automationId);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/automations");
  back("success=Automation%20updated");
}

/**
 * Runs one automation immediately. The run is recorded exactly as a scheduled
 * one would be, so the audit trail does not distinguish between work the café
 * asked for and work that happened on its own.
 */
export async function runAutomationNow(automationId: string) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("run_automation", {
    target_automation_id: automationId,
    triggered_by: "manual",
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/automations");
  back("success=Automation%20run");
}

export async function runDueAutomations() {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase.rpc("run_due_automations", {
    triggered_by: "manual",
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/automations");
  back("success=Due%20automations%20run");
}
