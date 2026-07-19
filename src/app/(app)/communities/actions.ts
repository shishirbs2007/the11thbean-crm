"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export async function createCommunity(formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase.from("communities").insert({
    name: value(formData, "name"),
    description: value(formData, "description") || null,
    category: value(formData, "category") || null,
    meeting_frequency: value(formData, "meeting_frequency") || null,
    notes: value(formData, "notes") || null,
  });

  if (error) {
    redirect(`/communities?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/communities");
  redirect("/communities?success=Community%20created");
}

export async function addCommunityMember(
  communityId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase.from("community_memberships").upsert({
    community_id: communityId,
    person_id: value(formData, "person_id"),
    role: value(formData, "role") || "member",
    joined_at: new Date().toISOString().slice(0, 10),
  });

  if (error) {
    redirect(`/communities?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/communities");
}

export async function removeCommunityMember(
  communityId: string,
  personId: string,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("community_memberships")
    .delete()
    .eq("community_id", communityId)
    .eq("person_id", personId);

  if (error) {
    redirect(`/communities?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/communities");
}
