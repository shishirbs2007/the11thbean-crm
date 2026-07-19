"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";

function value(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

export async function applyTransaction(formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const personId = value(formData, "person_id");
  const type = value(formData, "transaction_type");
  const points = Number(value(formData, "points") || 0);
  const wallet = Number(value(formData, "wallet_amount") || 0);

  const { error } = await supabase.rpc("apply_loyalty_transaction", {
    target_person_id: personId,
    target_type: type,
    target_points: points,
    target_wallet: wallet,
    target_description: value(formData, "description") || null,
    target_source_type: "manual",
    target_source_id: null,
  });

  if (error) {
    redirect(`/loyalty?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/loyalty");
  revalidatePath(`/customers/${personId}`);
  redirect("/loyalty?success=Transaction%20applied");
}

export async function issueGiftCard(formData: FormData) {
  await requireManager();
  const { supabase } = await requireUser();

  const amount = Number(value(formData, "amount"));
  const code =
    value(formData, "code") ||
    `BEAN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const { error } = await supabase.from("gift_cards").insert({
    code,
    owner_person_id: value(formData, "owner_person_id") || null,
    purchaser_person_id:
      value(formData, "purchaser_person_id") || null,
    original_value: amount,
    remaining_value: amount,
    expires_at: value(formData, "expires_at")
      ? new Date(value(formData, "expires_at")).toISOString()
      : null,
    notes: value(formData, "notes") || null,
  });

  if (error) {
    redirect(`/loyalty?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/loyalty");
  redirect("/loyalty?success=Gift%20card%20issued");
}
