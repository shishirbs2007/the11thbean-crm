"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { recordIncident } from "@/lib/monitoring/incidents";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

/**
 * Records that a guest is here.
 *
 * Deliberately available to any signed-in member of staff, not just managers:
 * whoever is on the counter is the person who sees the guest arrive, and a
 * permission check between them and the greeting defeats the point.
 */
export async function recordArrival(personId: string, formData: FormData) {
  const { supabase } = await requireUser();

  const partySize = Number(value(formData, "party_size") || 1);
  const note = value(formData, "note");

  const { error } = await supabase.rpc("record_arrival", {
    target_person_id: personId,
    guest_count: Number.isFinite(partySize) && partySize > 0 ? partySize : 1,
    arrival_note: note || null,
  });

  if (error) {
    await recordIncident(supabase, {
      area: "arrival",
      severity: "error",
      summary: "Could not record a guest's arrival",
      detail: error.message,
      personId,
    });

    redirect(`/arrival?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/arrival");
  // Straight back to the counter, ready for the next person.
  redirect(`/arrival?welcomed=${personId}`);
}

/**
 * Adds somebody the café has not met, in the least it can ask for, and records
 * their arrival in the same action.
 */
export async function quickAddGuest(formData: FormData) {
  const { supabase } = await requireUser();

  const name = value(formData, "guest_name");
  const phone = value(formData, "phone");
  const email = value(formData, "email");

  if (!name) {
    redirect("/arrival?error=A%20name%20is%20needed");
  }

  if (!phone && !email) {
    redirect(
      "/arrival?error=" +
        encodeURIComponent(
          "A phone number or email is needed so their orders can be recognised next time",
        ),
    );
  }

  const { data, error } = await supabase.rpc("quick_add_guest", {
    guest_name: name,
    contact_phone: phone || null,
    contact_email: email || null,
    guest_count: Number(value(formData, "party_size") || 1),
  });

  if (error) {
    await recordIncident(supabase, {
      area: "arrival",
      severity: "error",
      summary: "Could not add a guest at the counter",
      detail: error.message,
    });

    redirect(`/arrival?error=${encodeURIComponent(error.message)}`);
  }

  const result = data as { person_id?: string; already_known?: boolean } | null;

  revalidatePath("/arrival");
  redirect(
    `/arrival?welcomed=${result?.person_id ?? ""}${
      result?.already_known ? "&known=1" : ""
    }`,
  );
}
