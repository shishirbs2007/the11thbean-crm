"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function back(params: string): never {
  redirect(`/system?${params}`);
}

/**
 * Marks an incident as seen.
 *
 * Acknowledgement is not resolution — it records that somebody looked. An
 * incident nobody acknowledges stays visible, which is what keeps the next
 * real one from being lost in a list of old ones.
 */
export async function acknowledgeIncident(incidentId: string) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("system_incidents")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
    })
    .eq("id", incidentId);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/system");
  back("success=Incident%20acknowledged");
}

export async function acknowledgeAllInArea(area: string) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("system_incidents")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.id,
    })
    .eq("area", area)
    .is("acknowledged_at", null);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/system");
  back(`success=${encodeURIComponent(`Acknowledged everything in ${area}`)}`);
}
