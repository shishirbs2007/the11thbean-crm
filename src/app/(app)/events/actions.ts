"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createEvent(formData: FormData) {
  await requireManager();
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const starts_at = String(formData.get("starts_at") || "");
  const location = String(formData.get("location") || "").trim();
  const capacityRaw = String(formData.get("capacity") || "").trim();

  const { error } = await supabase.from("events").insert({
    name,
    starts_at: new Date(starts_at).toISOString(),
    location: location || null,
    capacity: capacityRaw ? Number(capacityRaw) : null,
  });

  if (error) redirect(`/events?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/events");
}
