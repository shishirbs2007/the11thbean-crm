"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";
import type { AudienceRule } from "@/lib/intelligence/audiences";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function back(params: string): never {
  redirect(`/audiences?${params}`);
}

/**
 * Rules arrive as a set of checkboxes plus optional parameters, and are stored
 * as the same jsonb shape the SQL evaluator reads. There is no second
 * representation of a rule anywhere in the application.
 */
function collectRules(formData: FormData): AudienceRule[] {
  return formData.getAll("rule_key").flatMap((entry) => {
    const key = String(entry);
    if (!key) return [];

    const rule: AudienceRule = { key };

    const days = Number(value(formData, `days_${key}`));
    if (Number.isFinite(days) && days > 0) rule.days = days;

    const referenceId = value(formData, `reference_id_${key}`);
    if (referenceId) rule.reference_id = referenceId;

    const referenceText = value(formData, `reference_text_${key}`);
    if (referenceText) rule.reference_text = referenceText;

    return [rule];
  });
}

export async function createAudience(formData: FormData) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const name = value(formData, "name");
  const rules = collectRules(formData);

  if (!name) {
    back("error=Give%20the%20audience%20a%20name");
  }

  if (rules.length === 0) {
    back("error=Choose%20at%20least%20one%20rule");
  }

  const { error } = await supabase.from("audiences").insert({
    name,
    description: value(formData, "description") || null,
    rules,
    match_mode: value(formData, "match_mode") === "all" ? "all" : "any",
    channel: value(formData, "channel") || "email",
    purpose: value(formData, "purpose") || "marketing",
    created_by: user.id,
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/audiences");
  back("success=Audience%20created");
}

export async function deleteAudience(audienceId: string) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("audiences")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", audienceId);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/audiences");
  back("success=Audience%20archived");
}
