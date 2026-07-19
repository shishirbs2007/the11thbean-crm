"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

export async function updateStaffRole(
  userId: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const role = String(formData.get("role") || "").trim();
  const active = formData.get("is_active") === "on";

  const { error } = await supabase
    .from("app_roles")
    .update({ role, is_active: active })
    .eq("user_id", userId);

  if (error) {
    redirect(`/staff?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/staff");
  redirect("/staff?success=Staff%20role%20updated");
}
