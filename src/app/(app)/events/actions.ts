"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export async function createEvent(formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const startsAt = value(formData, "starts_at");

  const { error } = await supabase.from("events").insert({
    name: value(formData, "name"),
    description: value(formData, "description") || null,
    starts_at: new Date(startsAt).toISOString(),
    ends_at: value(formData, "ends_at")
      ? new Date(value(formData, "ends_at")).toISOString()
      : null,
    location: value(formData, "location") || null,
    capacity: value(formData, "capacity")
      ? Number(value(formData, "capacity"))
      : null,
    price: Number(value(formData, "price") || 0),
    status: value(formData, "status") || "published",
    registration_deadline: value(formData, "registration_deadline")
      ? new Date(value(formData, "registration_deadline")).toISOString()
      : null,
  });

  if (error) {
    redirect(`/events?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/events");
  redirect("/events?success=Event%20created");
}

export async function registerCustomer(
  eventId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase.from("event_registrations").upsert({
    event_id: eventId,
    person_id: value(formData, "person_id"),
    status: value(formData, "status") || "registered",
  });

  if (error) {
    redirect(`/events?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/events");
}

export async function updateRegistration(
  eventId: string,
  personId: string,
  status: string,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("event_registrations")
    .update({ status })
    .eq("event_id", eventId)
    .eq("person_id", personId);

  if (error) {
    redirect(`/events?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/events");
}
