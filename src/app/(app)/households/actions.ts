"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const HouseholdSchema = z.object({
  household_name: z.string().trim().min(1, "Household name is required"),
  household_type: z.string().trim().default("family"),
  primary_contact_id: z.string().uuid().optional().or(z.literal("")),
  address: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  country: z.string().trim().optional(),
  postal_code: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function customerPath(id: string, type: "success" | "error", message: string) {
  return `/households/${id}?${type}=${encodeURIComponent(message)}`;
}

function redirectError(id: string, message: string): never {
  redirect(customerPath(id, "error", message));
}

function revalidateHousehold(id?: string) {
  revalidatePath("/households");
  if (id) revalidatePath(`/households/${id}`);
}

export async function createHousehold(formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = HouseholdSchema.parse(Object.fromEntries(formData));

  const { data, error } = await supabase
    .from("households")
    .insert({
      household_name: parsed.household_name,
      household_type: parsed.household_type || "family",
      primary_contact_id: parsed.primary_contact_id || null,
      address: parsed.address || null,
      city: parsed.city || null,
      state: parsed.state || null,
      country: parsed.country || "India",
      postal_code: parsed.postal_code || null,
      notes: parsed.notes || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/households?error=${encodeURIComponent(error.message)}`);
  }

  if (parsed.primary_contact_id) {
    const { error: memberError } = await supabase
      .from("household_members")
      .upsert(
        {
          household_id: data.id,
          person_id: parsed.primary_contact_id,
          relationship: "Primary contact",
          is_primary: true,
          left_at: null,
        },
        {
          onConflict: "household_id,person_id",
        },
      );

    if (memberError) {
      redirect(customerPath(data.id, "error", memberError.message));
    }
  }

  revalidateHousehold(data.id);
  redirect(
    customerPath(data.id, "success", "Household created successfully"),
  );
}

export async function updateHousehold(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const parsed = HouseholdSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("households")
    .update({
      household_name: parsed.household_name,
      household_type: parsed.household_type || "family",
      primary_contact_id: parsed.primary_contact_id || null,
      address: parsed.address || null,
      city: parsed.city || null,
      state: parsed.state || null,
      country: parsed.country || "India",
      postal_code: parsed.postal_code || null,
      notes: parsed.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) redirectError(id, error.message);

  if (parsed.primary_contact_id) {
    const { error: resetError } = await supabase
      .from("household_members")
      .update({ is_primary: false })
      .eq("household_id", id);

    if (resetError) redirectError(id, resetError.message);

    const { error: memberError } = await supabase
      .from("household_members")
      .upsert(
        {
          household_id: id,
          person_id: parsed.primary_contact_id,
          relationship: "Primary contact",
          is_primary: true,
          left_at: null,
        },
        {
          onConflict: "household_id,person_id",
        },
      );

    if (memberError) redirectError(id, memberError.message);
  }

  revalidateHousehold(id);
  redirect(customerPath(id, "success", "Household saved successfully"));
}

export async function addHouseholdMember(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const personId = value(formData, "person_id");
  const relationship = value(formData, "relationship");
  const notes = value(formData, "notes");
  const isPrimary = formData.get("is_primary") === "on";

  if (!personId) redirectError(id, "Choose a customer");

  if (isPrimary) {
    const { error: resetError } = await supabase
      .from("household_members")
      .update({ is_primary: false })
      .eq("household_id", id);

    if (resetError) redirectError(id, resetError.message);
  }

  const { error } = await supabase.from("household_members").upsert(
    {
      household_id: id,
      person_id: personId,
      relationship: relationship || null,
      is_primary: isPrimary,
      notes: notes || null,
      joined_at: new Date().toISOString(),
      left_at: null,
    },
    {
      onConflict: "household_id,person_id",
    },
  );

  if (error) redirectError(id, error.message);

  if (isPrimary) {
    const { error: householdError } = await supabase
      .from("households")
      .update({
        primary_contact_id: personId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (householdError) redirectError(id, householdError.message);
  }

  revalidateHousehold(id);
  redirect(customerPath(id, "success", "Household member saved"));
}

export async function removeHouseholdMember(
  id: string,
  personId: string,
) {
  const { supabase } = await requireUser();

  const { data: member, error: readError } = await supabase
    .from("household_members")
    .select("is_primary")
    .eq("household_id", id)
    .eq("person_id", personId)
    .maybeSingle();

  if (readError) redirectError(id, readError.message);

  const { error } = await supabase
    .from("household_members")
    .delete()
    .eq("household_id", id)
    .eq("person_id", personId);

  if (error) redirectError(id, error.message);

  if (member?.is_primary) {
    const { error: householdError } = await supabase
      .from("households")
      .update({
        primary_contact_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (householdError) redirectError(id, householdError.message);
  }

  revalidateHousehold(id);
  redirect(customerPath(id, "success", "Household member removed"));
}

export async function addHouseholdAddress(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const isPrimary = formData.get("is_primary") === "on";

  if (isPrimary) {
    const { error: resetError } = await supabase
      .from("household_addresses")
      .update({ is_primary: false })
      .eq("household_id", id);

    if (resetError) redirectError(id, resetError.message);
  }

  const { error } = await supabase.from("household_addresses").insert({
    household_id: id,
    label: value(formData, "label") || "Home",
    address_line_1: value(formData, "address_line_1") || null,
    address_line_2: value(formData, "address_line_2") || null,
    city: value(formData, "city") || null,
    state: value(formData, "state") || null,
    country: value(formData, "country") || "India",
    postal_code: value(formData, "postal_code") || null,
    is_primary: isPrimary,
    updated_at: new Date().toISOString(),
  });

  if (error) redirectError(id, error.message);

  revalidateHousehold(id);
  redirect(customerPath(id, "success", "Address added"));
}

export async function deleteHouseholdAddress(
  householdId: string,
  addressId: string,
) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("household_addresses")
    .delete()
    .eq("id", addressId)
    .eq("household_id", householdId);

  if (error) redirectError(householdId, error.message);

  revalidateHousehold(householdId);
  redirect(customerPath(householdId, "success", "Address removed"));
}

export async function saveHouseholdPreferences(
  id: string,
  formData: FormData,
) {
  const { supabase } = await requireUser();

  const { error } = await supabase.from("household_preferences").upsert({
    household_id: id,
    favourite_table: value(formData, "favourite_table") || null,
    favourite_area: value(formData, "favourite_area") || null,
    seating_notes: value(formData, "seating_notes") || null,
    dietary_notes: value(formData, "dietary_notes") || null,
    allergies: value(formData, "allergies") || null,
    preferred_visit_time:
      value(formData, "preferred_visit_time") || null,
    preferred_temperature:
      value(formData, "preferred_temperature") || null,
    music_preferences: value(formData, "music_preferences") || null,
    lighting_preferences:
      value(formData, "lighting_preferences") || null,
    celebration_notes: value(formData, "celebration_notes") || null,
    updated_at: new Date().toISOString(),
  });

  if (error) redirectError(id, error.message);

  revalidateHousehold(id);
  redirect(customerPath(id, "success", "Household preferences saved"));
}

export async function archiveHousehold(id: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("households")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) redirectError(id, error.message);

  revalidateHousehold(id);
  redirect("/households?success=Household%20archived");
}

export async function restoreHousehold(id: string) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("households")
    .update({
      is_active: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) redirectError(id, error.message);

  revalidateHousehold(id);
  redirect(customerPath(id, "success", "Household restored"));
}
