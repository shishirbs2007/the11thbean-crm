"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

export async function recalculateHealth() {
  await requireManager();
  const { supabase } = await requireUser();

  const { data, error } = await supabase.rpc(
    "recalculate_customer_health",
  );

  if (error) {
    redirect(`/insights?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/insights");
  revalidatePath("/dashboard");
  redirect(`/insights?success=${encodeURIComponent(
    `${data ?? 0} customer health records recalculated`,
  )}`);
}
