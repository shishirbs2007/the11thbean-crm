import type {
  NormalizedItem,
  NormalizedKot,
  NormalizedOrder,
  NormalizedPayment,
} from "./order-types.ts";

// Defensive normalization. PetPooja's exact field names vary across versions,
// so each normalized field is resolved from a list of candidate keys. Nothing
// is invented: unknown fields simply stay null, and the full raw record is
// preserved so mappings can be corrected against a real payload later.

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function num(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      // Strip currency symbols / thousands separators before parsing.
      const cleaned = v.replace(/[^0-9.\-]/g, "");
      if (cleaned && Number.isFinite(Number(cleaned))) return Number(cleaned);
    }
  }
  return null;
}

function arr(obj: Record<string, unknown>, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function names(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((el) => {
      if (typeof el === "string") return el;
      const r = asRecord(el);
      return r ? str(r, ["name", "variation_name", "addon_name", "title"]) : null;
    })
    .filter((n): n is string => Boolean(n));
}

export function normalizeItem(raw: unknown): NormalizedItem {
  const o = asRecord(raw) ?? {};
  return {
    itemId: str(o, ["item_id", "itemid", "id", "item_code"]),
    name: str(o, ["name", "item_name", "itemname", "title"]),
    quantity: num(o, ["quantity", "qty"]),
    unitPrice: num(o, ["unit_price", "unitprice", "price", "rate"]),
    total: num(o, ["total", "amount", "item_total", "final_price"]),
    taxes: num(o, ["tax", "taxes", "tax_amount", "total_tax"]),
    discount: num(o, ["discount", "discount_amount"]),
    variations: names(o["variation"] ?? o["variations"]),
    addons: names(o["addon"] ?? o["addons"] ?? o["add_on"] ?? o["addon_items"]),
    raw,
  };
}

export function normalizePayment(raw: unknown): NormalizedPayment {
  const o = asRecord(raw) ?? {};
  return {
    type: str(o, ["type", "payment_type", "paymenttype", "mode", "payment_mode"]),
    amount: num(o, ["amount", "paid_amount", "value"]),
    reference: str(o, ["reference", "ref", "ref_no", "transaction_id", "txn_id"]),
    raw,
  };
}

export function normalizeKot(raw: unknown): NormalizedKot {
  const o = asRecord(raw) ?? {};
  return {
    kotId: str(o, ["kot_id", "kotid", "kot_no", "kotno", "id"]),
    createdAt: str(o, ["created_on", "created_at", "kot_time", "time"]),
    raw,
  };
}

export function normalizeOrder(raw: unknown): NormalizedOrder {
  const o = asRecord(raw) ?? {};
  return {
    petpoojaOrderId: str(o, ["orderID", "order_id", "orderid", "id"]),
    invoiceNo: str(o, ["invoice_no", "invoiceno", "invoice_number", "bill_no"]),
    orderDateTime: str(o, [
      "created_on",
      "order_date",
      "created_date",
      "order_time",
      "date_time",
      "created_at",
    ]),
    status: str(o, ["order_status", "status", "orderstatus"]),
    orderType: str(o, ["order_type", "ordertype", "type"]),
    orderSource: str(o, ["order_from", "order_source", "ordersource", "source", "channel"]),
    table: str(o, ["table_no", "table", "table_name", "tableno"]),
    customerName: str(o, ["customer_name", "customername", "cust_name", "name"]),
    customerMobile: str(o, [
      "customer_phone",
      "customer_mobile",
      "customer_mobileno",
      "cust_mobile",
      "mobile",
      "phone",
    ]),
    subtotal: num(o, ["sub_total", "subtotal", "item_total"]),
    discount: num(o, ["discount", "discount_amount", "total_discount"]),
    taxes: num(o, ["tax", "taxes", "tax_amount", "total_tax"]),
    serviceCharge: num(o, ["service_charge", "servicecharge", "service_charges"]),
    deliveryCharge: num(o, ["delivery_charge", "deliverycharge"]),
    containerCharge: num(o, ["container_charge", "packaging_charge", "packing_charge"]),
    roundOff: num(o, ["round_off", "roundoff"]),
    grandTotal: num(o, [
      "grand_total",
      "grandtotal",
      "total",
      "net_amount",
      "order_total",
      "total_amount",
    ]),
    paymentStatus: str(o, ["payment_status", "paymentstatus", "settlement_status", "paid_status"]),
    captain: str(o, ["captain", "captain_name", "waiter", "waiter_name", "steward"]),
    items: arr(o, ["items", "order_items", "orderitems", "item_details", "details"]).map(normalizeItem),
    payments: arr(o, ["payments", "order_payments", "payment_details", "paymentdetails"]).map(
      normalizePayment,
    ),
    kots: arr(o, ["kot", "kots", "kot_details", "kotdetails"]).map(normalizeKot),
    raw,
  };
}

// Locate the array of order records inside an unknown response envelope.
export function extractOrderArray(json: unknown): unknown[] {
  const o = asRecord(json);
  if (!o) return Array.isArray(json) ? json : [];
  const direct = arr(o, ["orders", "data", "order_list", "orderlist", "records", "result"]);
  if (direct.length > 0) return direct;
  // Some responses nest under data: { orders: [...] }.
  const dataObj = asRecord(o["data"]);
  if (dataObj) return arr(dataObj, ["orders", "order_list", "records"]);
  return [];
}

export function extractTotalRecords(json: unknown): number | null {
  const o = asRecord(json);
  if (!o) return null;
  const total = num(o, ["total_records", "totalRecords", "total", "total_count", "count"]);
  if (total !== null) return total;
  const dataObj = asRecord(o["data"]);
  return dataObj ? num(dataObj, ["total_records", "total", "count"]) : null;
}
