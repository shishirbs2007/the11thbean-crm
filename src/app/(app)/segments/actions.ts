"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export async function createSegment(formData: FormData) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("saved_segments").insert({
    name: value(formData, "name"),
    description: value(formData, "description") || null,
    filter_definition: {
      customer_status: value(formData, "customer_status") || null,
      minimum_visits: Number(value(formData, "minimum_visits") || 0),
      maximum_churn_risk: value(formData, "maximum_churn_risk")
        ? Number(value(formData, "maximum_churn_risk"))
        : null,
      minimum_lifetime_value: Number(
        value(formData, "minimum_lifetime_value") || 0,
      ),
    },
    created_by: user.id,
  });

  if (error) {
    redirect(`/segments?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/segments");
  redirect("/segments?success=Segment%20created");
}

export async function addSegmentMember(
  segmentId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("segment_memberships").upsert({
    segment_id: segmentId,
    person_id: value(formData, "person_id"),
    added_by: user.id,
  });

  if (error) {
    redirect(`/segments?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/segments");
  redirect("/segments?success=Customer%20added%20to%20segment");
}

export async function removeSegmentMember(
  segmentId: string,
  personId: string,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("segment_memberships")
    .delete()
    .eq("segment_id", segmentId)
    .eq("person_id", personId);

  if (error) {
    redirect(`/segments?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/segments");
}
