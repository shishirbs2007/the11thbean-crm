"use server";

import { requireUser } from "@/lib/auth";
import { recordIncident } from "@/lib/monitoring/incidents";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export type GuestMatch = {
  id: string;
  name: string;
  subtitle: string;
};

export type WelcomeResult =
  | { ok: true; context: Record<string, unknown> }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function displayName(person: {
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
}): string {
  return `${person.preferred_name || person.first_name} ${
    person.last_name || ""
  }`.trim();
}

/**
 * Live guest search for the counter.
 *
 * Returns quickly and quietly: an empty query is not an error, and a query
 * that happens to be a scanned card (a bare id) resolves to that one guest so
 * a barcode reader can drive the whole interaction without a search at all.
 */
export async function searchGuests(query: string): Promise<GuestMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const { supabase } = await requireUser();

  // A scanned loyalty code is the person's id. Resolve it directly.
  if (UUID.test(trimmed)) {
    const { data } = await supabase
      .from("people")
      .select("id, first_name, last_name, preferred_name, phone")
      .eq("id", trimmed)
      .eq("is_active", true)
      .maybeSingle();

    return data
      ? [{ id: data.id, name: displayName(data), subtitle: data.phone ?? "" }]
      : [];
  }

  const { data } = await supabase
    .from("people")
    .select("id, first_name, last_name, preferred_name, phone")
    .eq("is_active", true)
    .or(
      `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%,preferred_name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`,
    )
    .order("first_name")
    .limit(6);

  return (data ?? []).map((person) => ({
    id: person.id,
    name: displayName(person),
    subtitle: person.phone ?? "",
  }));
}

/**
 * Records a guest is here and returns what to say to them, without navigating.
 * Available to any signed-in member of staff, because whoever is on the counter
 * is the person who sees the guest arrive.
 */
export async function welcomeGuest(
  personId: string,
  partySize = 1,
): Promise<WelcomeResult> {
  const { supabase } = await requireUser();

  const size = Number.isFinite(partySize) && partySize > 0 ? partySize : 1;

  const { data, error } = await supabase.rpc("record_arrival", {
    target_person_id: personId,
    guest_count: size,
    arrival_note: null,
  });

  if (error) {
    await recordIncident(supabase, {
      area: "arrival",
      severity: "error",
      summary: "Could not record a guest's arrival",
      detail: error.message,
      personId,
    });

    return { ok: false, error: error.message };
  }

  return { ok: true, context: (data ?? {}) as Record<string, unknown> };
}

/**
 * Adds a guest from the least the café can ask for, and welcomes them in the
 * same call. Recognises a phone or email it already knows rather than creating
 * a duplicate from a busy counter.
 */
export async function quickAddAndWelcome(
  formData: FormData,
): Promise<WelcomeResult> {
  const { supabase } = await requireUser();

  const name = value(formData, "guest_name");
  const phone = value(formData, "phone");
  const email = value(formData, "email");

  if (!name) return { ok: false, error: "A name is needed" };

  if (!phone && !email) {
    return {
      ok: false,
      error:
        "A phone number or email is needed so their orders can be recognised next time",
    };
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

    return { ok: false, error: error.message };
  }

  return { ok: true, context: (data ?? {}) as Record<string, unknown> };
}
