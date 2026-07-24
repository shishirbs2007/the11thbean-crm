export type PosMenuItem = {
  id: string;
  name: string;
  price: number;
  sku: string | null;
  category_id: string | null;
};

export type PosMenuCategory = {
  id: string;
  name: string;
  items: PosMenuItem[];
};

export type PosCheckoutLine = {
  menu_item_id: string | null;
  item_name: string;
  category: string | null;
  unit_price: number;
  quantity: number;
  modifiers?: unknown[];
};

export type PosCheckoutPayload = {
  client_order_id: string;
  person_id?: string | null;
  customer_name?: string | null;
  notes?: string | null;
  payment_method: string;
  amount_tendered?: number | null;
  discount_amount?: number;
  tax_amount?: number;
  placed_at: string;
  lines: PosCheckoutLine[];
};

export type PosCheckoutResult =
  | {
      ok: true;
      order_id: string;
      order_number: number;
      created: boolean;
      total: number | null;
      change_due: number | null;
    }
  | { ok: false; error: string };

export type PosRecentOrder = {
  id: string;
  order_number: number;
  total: number;
  payment_method: string | null;
  customer_name: string | null;
  placed_at: string;
  status: string;
};

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}
