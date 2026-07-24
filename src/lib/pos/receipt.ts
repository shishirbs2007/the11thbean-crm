import { formatINR } from "./types";

export type ReceiptItem = {
  item_name: string;
  quantity: number;
  unit_price: number;
};

export type Receipt = {
  order_number: number | null;
  reference: string;
  placed_at: string;
  customer_name?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  payment_method: string;
  change_due: number | null;
  synced: boolean;
};

// Plain-text receipt for Android's native share sheet (WhatsApp/SMS/email/etc.)
// and the copy fallback. Text only — no formatting, no PDF, no GST invoice.
export function buildReceiptText(r: Receipt): string {
  const lines: string[] = [];
  lines.push("The 11th Bean");
  lines.push(new Date(r.placed_at).toLocaleString("en-IN"));
  lines.push(
    r.order_number !== null
      ? `Order #${r.order_number}`
      : `Ref ${r.reference.slice(0, 8)}`,
  );
  if (r.customer_name) lines.push(`Customer: ${r.customer_name}`);
  lines.push("--------------------------------");
  for (const item of r.items) {
    lines.push(
      `${item.quantity} x ${item.item_name}  ${formatINR(item.unit_price * item.quantity)}`,
    );
  }
  lines.push("--------------------------------");
  lines.push(`Subtotal  ${formatINR(r.subtotal)}`);
  if (r.discount > 0) lines.push(`Discount  -${formatINR(r.discount)}`);
  lines.push(`Total     ${formatINR(r.total)}`);
  lines.push(`Paid via  ${r.payment_method.toUpperCase()}`);
  if (r.change_due !== null && r.change_due > 0) {
    lines.push(`Change    ${formatINR(r.change_due)}`);
  }
  if (!r.synced) lines.push("(offline — will sync to records)");
  lines.push("");
  lines.push("Thank you!");
  return lines.join("\n");
}
