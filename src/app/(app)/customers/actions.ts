"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const PersonSchema = z.object({
  first_name: z.string().trim().min(1),
  last_name: z.string().trim().optional(),
  preferred_name: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  occupation: z.string().trim().optional(),
  company: z.string().trim().optional(),
});

export async function createPerson(formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = PersonSchema.parse(Object.fromEntries(formData));

  const { data, error } = await supabase
    .from("people")
    .insert({
      ...parsed,
      last_name: parsed.last_name || null,
      preferred_name: parsed.preferred_name || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      occupation: parsed.occupation || null,
      company: parsed.company || null,
    })
    .select("id")
    .single();

  if (error) redirect(`/customers/new?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/customers");
  redirect(`/customers/${data.id}?success=${encodeURIComponent("Customer created successfully")}`);
}

export async function updatePerson(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const parsed = PersonSchema.parse(Object.fromEntries(formData));

  const { error } = await supabase
    .from("people")
    .update({
      ...parsed,
      last_name: parsed.last_name || null,
      preferred_name: parsed.preferred_name || null,
      phone: parsed.phone || null,
      email: parsed.email || null,
      occupation: parsed.occupation || null,
      company: parsed.company || null,
    })
    .eq("id", id);

  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/customers/${id}`);
  revalidatePath("/customers");
  redirect(`/customers/${id}?success=${encodeURIComponent("Customer saved successfully")}`);
}

export async function addNote(id: string, formData: FormData) {
  const { supabase, user } = await requireUser();
  const note = String(formData.get("note") || "").trim();
  const visibility = String(formData.get("visibility") || "barista");
  if (!note) return;

  const { error } = await supabase.from("customer_notes").insert({
    person_id: id,
    note,
    visibility,
    created_by: user.id,
  });

  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?success=${encodeURIComponent("Note added successfully")}`);
}

export async function addPreference(id: string, formData: FormData) {
  const { supabase } = await requireUser();
  const preference_type = String(formData.get("preference_type") || "").trim();
  const preference_value = String(formData.get("preference_value") || "").trim();
  if (!preference_type || !preference_value) return;

  const { error } = await supabase.from("customer_preferences").upsert({
    person_id: id,
    preference_type,
    preference_value,
    source: "staff",
  });

  if (error) redirect(`/customers/${id}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?success=${encodeURIComponent("Preference saved successfully")}`);
}
