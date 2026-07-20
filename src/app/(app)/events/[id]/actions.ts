"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function back(eventId: string, params: string): never {
  redirect(`/events/${eventId}?${params}`);
}

export async function inviteToEvent(eventId: string, formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const personId = value(formData, "person_id");

  if (!personId) {
    back(eventId, "error=Choose%20someone%20to%20invite");
  }

  const { error } = await supabase.from("event_registrations").upsert(
    {
      event_id: eventId,
      person_id: personId,
      status: "interested",
      invited_at: new Date().toISOString(),
    },
    { onConflict: "event_id,person_id" },
  );

  if (error) {
    back(eventId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, "success=Invitation%20recorded");
}

export async function registerForEvent(eventId: string, formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const personId = value(formData, "person_id");
  const guestCount = Number(value(formData, "guest_count") || 1);

  if (!personId) {
    back(eventId, "error=Choose%20someone%20to%20register");
  }

  if (!Number.isInteger(guestCount) || guestCount < 1) {
    back(eventId, "error=Guest%20count%20must%20be%20at%20least%201");
  }

  const { error } = await supabase.from("event_registrations").upsert(
    {
      event_id: eventId,
      person_id: personId,
      status: "registered",
      guest_count: guestCount,
      notes: value(formData, "notes") || null,
    },
    { onConflict: "event_id,person_id" },
  );

  if (error) {
    back(eventId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, "success=Registration%20saved");
}

/**
 * Marking attendance also writes the guest's timeline and refreshes their
 * health, so the next person to serve them knows they were here.
 */
export async function markAttendance(eventId: string, formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const personId = value(formData, "person_id");
  const didAttend = value(formData, "did_attend") === "true";

  if (!personId) {
    back(eventId, "error=Choose%20a%20guest%20to%20mark%20off");
  }

  const { error } = await supabase.rpc("record_event_attendance", {
    target_event_id: eventId,
    target_person_id: personId,
    did_attend: didAttend,
  });

  if (error) {
    back(eventId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, "success=Attendance%20recorded");
}

export async function updateEvent(eventId: string, formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const startsAt = value(formData, "starts_at");

  const { error } = await supabase
    .from("events")
    .update({
      name: value(formData, "name"),
      description: value(formData, "description") || null,
      starts_at: startsAt ? new Date(startsAt).toISOString() : undefined,
      location: value(formData, "location") || null,
      capacity: value(formData, "capacity")
        ? Number(value(formData, "capacity"))
        : null,
      event_type: value(formData, "event_type") || "general",
      community_id: value(formData, "community_id") || null,
      host_notes: value(formData, "host_notes") || null,
      status: value(formData, "status") || "published",
      updated_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) {
    back(eventId, `error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  back(eventId, "success=Event%20updated");
}
