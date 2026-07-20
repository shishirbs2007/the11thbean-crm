"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function back(params: string): never {
  redirect(`/campaigns?${params}`);
}

export async function createCampaign(formData: FormData) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const name = value(formData, "name");

  if (!name) {
    back("error=Give%20the%20campaign%20a%20name");
  }

  const { error } = await supabase.from("communication_campaigns").insert({
    name,
    description: value(formData, "description") || null,
    channel: value(formData, "channel") || "email",
    purpose: value(formData, "purpose") || "marketing",
    audience_id: value(formData, "audience_id") || null,
    template_id: value(formData, "template_id") || null,
    created_by: user.id,
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/campaigns");
  back("success=Campaign%20drafted");
}

/**
 * The four questions a campaign must answer before anyone may review it.
 * Stored on the campaign so the reasoning survives the send.
 */
export async function saveRationale(campaignId: string, formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("communication_campaigns")
    .update({
      audience_id: value(formData, "audience_id") || null,
      rationale_why_them: value(formData, "rationale_why_them") || null,
      rationale_why_now: value(formData, "rationale_why_now") || null,
      rationale_why_message: value(formData, "rationale_why_message") || null,
      hoped_outcome: value(formData, "hoped_outcome") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/campaigns");
  back("success=Saved");
}

/**
 * Lifecycle transitions are enforced in the database, so a campaign cannot be
 * approved without having been reviewed, or scheduled without approval.
 */
export async function advanceCampaign(campaignId: string, formData: FormData) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const nextStatus = value(formData, "next_status");

  if (!nextStatus) {
    back("error=No%20next%20step%20given");
  }

  const { error } = await supabase.rpc("advance_campaign_status", {
    target_campaign_id: campaignId,
    next_status: nextStatus,
    actor: user.id,
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/campaigns");
  back(`success=${encodeURIComponent(`Campaign moved to ${nextStatus}`)}`);
}

export async function toggleAutomation(
  automationId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("hospitality_automations")
    .update({
      is_active: value(formData, "is_active") === "true",
      updated_at: new Date().toISOString(),
    })
    .eq("id", automationId);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/campaigns");
  back("success=Automation%20updated");
}
