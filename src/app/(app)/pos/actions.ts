"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import type { PosCheckoutPayload, PosCheckoutResult } from "@/lib/pos/types";

const LineSchema = z.object({
  menu_item_id: z.string().uuid().nullable().optional(),
  item_name: z.string().trim().min(1),
  category: z.string().trim().nullable().optional(),
  unit_price: z.number().nonnegative(),
  quantity: z.number().positive(),
  modifiers: z.array(z.unknown()).optional(),
});

const PayloadSchema = z.object({
  client_order_id: z.string().uuid(),
  person_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().trim().nullable().optional(),
  notes: z.string().trim().nullable().optional(),
  payment_method: z.string().trim().min(1),
  amount_tendered: z.number().nonnegative().nullable().optional(),
  discount_amount: z.number().nonnegative().optional(),
  tax_amount: z.number().nonnegative().optional(),
  placed_at: z.string().min(1),
  lines: z.array(LineSchema).min(1),
});

export async function submitPosOrder(
  payload: PosCheckoutPayload,
): Promise<PosCheckoutResult> {
  const { supabase } = await requireUser();

  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Invalid order payload" };
  }

  const { data, error } = await supabase.rpc("pos_checkout", {
    payload: parsed.data,
  });

  if (error) return { ok: false, error: error.message };

  const row = (data ?? {}) as {
    order_id: string;
    order_number: number;
    created: boolean;
    total: number | null;
    change_due: number | null;
  };

  return {
    ok: true,
    order_id: row.order_id,
    order_number: row.order_number,
    created: row.created,
    total: row.total ?? null,
    change_due: row.change_due ?? null,
  };
}

// NOTE: the standalone release intentionally has no customer lookup. The POS
// reads no CRM tables and links to no guest record; an optional free-text
// customer name is captured on the pos_orders row for the receipt only.
