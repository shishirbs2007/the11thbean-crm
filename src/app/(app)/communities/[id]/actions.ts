"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function back(communityId: string, params: string): never {
  redirect(`/communities/${communityId}?${params}`);
}

export async function updateCommunity(
  communityId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("communities")
    .update({
      name: value(formData, "name"),
      description: value(formData, "description") || null,
      category: value(formData, "category") || null,
      meeting_frequency: value(formData, "meeting_frequency") || null,
      notes: value(formData, "notes") || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", communityId);

  if (error) {
    back(communityId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/communities/${communityId}`);
  back(communityId, "success=Community%20updated");
}

/**
 * Membership is managed here and nowhere else. Other screens link to this
 * page rather than growing their own version of the same form.
 */
export async function joinCommunity(communityId: string, formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const personId = value(formData, "person_id");

  if (!personId) {
    back(communityId, "error=Choose%20someone%20to%20add");
  }

  const { error } = await supabase.from("community_memberships").upsert(
    {
      community_id: communityId,
      person_id: personId,
      role: value(formData, "role") || "member",
      joined_at: new Date().toISOString().slice(0, 10),
      left_at: null,
    },
    { onConflict: "community_id,person_id" },
  );

  if (error) {
    back(communityId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/communities/${communityId}`);
  back(communityId, "success=Member%20added");
}

/**
 * Someone leaving is recorded rather than deleted, so the café keeps the
 * history of who used to be part of the group.
 */
export async function leaveCommunity(
  communityId: string,
  personId: string,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("community_memberships")
    .update({ left_at: new Date().toISOString().slice(0, 10) })
    .eq("community_id", communityId)
    .eq("person_id", personId);

  if (error) {
    back(communityId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/communities/${communityId}`);
  back(communityId, "success=Member%20marked%20as%20left");
}
