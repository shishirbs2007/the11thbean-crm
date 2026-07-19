"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function redirectError(id: string, message: string): never {
  redirect(`/customers/${id}?error=${encodeURIComponent(message)}`);
}

export async function saveHospitalityProfile(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const list = (name: string) =>
    String(formData.get(name) || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

  const { error } = await supabase
    .from("customer_hospitality_profiles")
    .upsert({
      person_id: id,
      preferred_table:
        String(formData.get("preferred_table") || "").trim() || null,
      preferred_zone:
        String(formData.get("preferred_zone") || "").trim() || null,
      preferred_visit_time:
        String(formData.get("preferred_visit_time") || "").trim() || null,
      typical_visit_context:
        String(formData.get("typical_visit_context") || "").trim() || null,
      coffee_preferences: {
        drink: String(formData.get("coffee_drink") || "").trim(),
        milk: String(formData.get("coffee_milk") || "").trim(),
        strength: String(formData.get("coffee_strength") || "").trim(),
        sweetness: String(formData.get("coffee_sweetness") || "").trim(),
      },
      food_preferences: {
        favourites: list("food_favourites"),
        dislikes: list("food_dislikes"),
      },
      dietary_restrictions: list("dietary_restrictions"),
      allergies: list("allergies"),
      languages: list("languages"),
      accessibility_needs:
        String(formData.get("accessibility_needs") || "").trim() || null,
      children_notes:
        String(formData.get("children_notes") || "").trim() || null,
      work_style: String(formData.get("work_style") || "").trim() || null,
      conversation_preferences:
        String(formData.get("conversation_preferences") || "").trim() || null,
      do_not_mention:
        String(formData.get("do_not_mention") || "").trim() || null,
      staff_summary:
        String(formData.get("staff_summary") || "").trim() || null,
    });

  if (error) redirectError(id, error.message);
  revalidatePath(`/customers/${id}`);
}

export async function addPet(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;

  const { error } = await supabase.from("pets").insert({
    person_id: id,
    name,
    species: String(formData.get("species") || "").trim() || null,
    breed: String(formData.get("breed") || "").trim() || null,
    temperament:
      String(formData.get("temperament") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  if (error) redirectError(id, error.message);
  revalidatePath(`/customers/${id}`);
}

export async function addImportantDate(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("important_dates").insert({
    person_id: id,
    date_type: String(formData.get("date_type") || "").trim(),
    date_value: String(formData.get("date_value") || ""),
    label: String(formData.get("label") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  if (error) redirectError(id, error.message);
  revalidatePath(`/customers/${id}`);
}

export async function addRelationship(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const relatedPersonId = String(
    formData.get("related_person_id") || "",
  ).trim();
  const relationshipType = String(
    formData.get("relationship_type") || "",
  ).trim();

  if (!relatedPersonId || !relationshipType) return;

  const { error } = await supabase.from("person_relationships").insert({
    person_id: id,
    related_person_id: relatedPersonId,
    relationship_type: relationshipType,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  if (error) redirectError(id, error.message);
  revalidatePath(`/customers/${id}`);
}

export async function addReferral(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const referredPersonId = String(
    formData.get("referred_person_id") || "",
  ).trim();

  if (!referredPersonId) return;

  const { error } = await supabase.from("referrals").insert({
    referrer_person_id: id,
    referred_person_id: referredPersonId,
    source_context:
      String(formData.get("source_context") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
  });

  if (error) redirectError(id, error.message);
  revalidatePath(`/customers/${id}`);
}

export async function addMilestone(id: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const title = String(formData.get("title") || "").trim();
  if (!title) return;

  const occurredAt =
    String(formData.get("occurred_at") || "").trim() ||
    new Date().toISOString();

  const { data, error } = await supabase
    .from("customer_milestones")
    .insert({
      person_id: id,
      milestone_type:
        String(formData.get("milestone_type") || "").trim() ||
        "relationship",
      title,
      description:
        String(formData.get("description") || "").trim() || null,
      occurred_at: new Date(occurredAt).toISOString(),
      created_by: user.id,
    })
    .select("id, occurred_at")
    .single();

  if (error) redirectError(id, error.message);

  const { error: timelineError } = await supabase
    .from("timeline_entries")
    .insert({
      person_id: id,
      event_type: "milestone",
      title,
      summary:
        String(formData.get("description") || "").trim() || null,
      occurred_at: data.occurred_at,
      source_type: "customer_milestone",
      source_id: data.id,
      visibility: "barista",
      created_by: user.id,
    });

  if (timelineError) redirectError(id, timelineError.message);
  revalidatePath(`/customers/${id}`);
}
