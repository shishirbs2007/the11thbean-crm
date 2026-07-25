// Sanitized fixtures modelling the observed inner_order_listing response shape.
// No real customer PII: names, phone numbers and identifiers are synthetic.

export function rawFullOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    orderID: "1001",
    invoice_no: "INV-1001",
    created_on: "2026-07-25 14:30:00",
    order_status: "Success",
    order_type: "Dine In",
    order_from: "POS",
    table_no: "5",
    customer_name: "Test Guest",
    customer_phone: "9990000011",
    sub_total: "260.00",
    discount: "10.00",
    tax: "12.50",
    service_charge: "0.00",
    delivery_charge: "0.00",
    container_charge: "0.00",
    round_off: "0.50",
    grand_total: "263.00",
    payment_status: "Paid",
    captain: "Staff One",
    items: [
      { item_id: "BRW", name: "Brownie", quantity: "2", price: "100", total: "200", tax: "10", discount: "0" },
      { item_id: "CKE", name: "Cookie", quantity: "1", price: "60", total: "60", tax: "2.50", discount: "10.00" },
    ],
    payments: [
      { type: "Cash", amount: "163.00" },
      { type: "UPI", amount: "100.00", reference: "UPIREF123" },
    ],
    kot: [{ kot_id: "K-1", created_on: "2026-07-25 14:31:00" }],
    ...overrides,
  };
}

export function rawOrderMissingCustomer(): Record<string, unknown> {
  const o = rawFullOrder({ orderID: "1002", invoice_no: "INV-1002" });
  delete o.customer_name;
  delete o.customer_phone;
  return o;
}

export function rawOrderMissingMobile(): Record<string, unknown> {
  const o = rawFullOrder({ orderID: "1003", invoice_no: "INV-1003", customer_name: "Named Guest" });
  delete o.customer_phone;
  return o;
}

export function listingResponse(
  orders: Record<string, unknown>[],
  totalRecords = orders.length,
): Record<string, unknown> {
  return { status: 1, total_records: totalRecords, orders };
}
