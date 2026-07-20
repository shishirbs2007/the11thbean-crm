"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireManager, requireUser } from "@/lib/auth";
import { parseOrderCsv } from "@/lib/integrations/csv-orders";

function back(params: string): never {
  redirect(`/integrations?${params}`);
}

/**
 * Imports a till export.
 *
 * The file is parsed here and handed to the database as the same
 * provider-neutral payload every adapter produces, so there is one import path
 * regardless of which till the café uses.
 */
export async function importOrderCsv(formData: FormData) {
  await requireManager();
  const { supabase, user } = await requireUser();

  const file = formData.get("orders_csv");

  if (!(file instanceof File) || file.size === 0) {
    back("error=Choose%20a%20CSV%20file%20exported%20from%20the%20till");
  }

  // A till export for one café should never be large. This is a guard against
  // somebody uploading the wrong file entirely.
  if (file.size > 5_000_000) {
    back("error=That%20file%20is%20larger%20than%205MB.%20Split%20the%20export%20by%20date.");
  }

  const { orders, rejected } = parseOrderCsv(await file.text());

  if (orders.length === 0) {
    const reason = rejected[0]?.reason ?? "No usable orders found in that file";
    back(`error=${encodeURIComponent(reason)}`);
  }

  const { error } = await supabase.rpc("import_orders", {
    adapter: "generic_pos",
    orders,
    actor: user.id,
  });

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/integrations");

  const note =
    rejected.length > 0
      ? `Imported ${orders.length} orders. ${rejected.length} rows were skipped.`
      : `Imported ${orders.length} orders.`;

  back(`success=${encodeURIComponent(note)}`);
}

export async function setAdapterEnabled(
  adapterKey: string,
  formData: FormData,
) {
  await requireManager();
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("integration_adapters")
    .update({
      is_enabled: String(formData.get("is_enabled")) === "true",
      updated_at: new Date().toISOString(),
    })
    .eq("key", adapterKey);

  if (error) {
    back(`error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/integrations");
  back("success=Integration%20updated");
}
