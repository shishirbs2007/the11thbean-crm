import { describe, expect, it } from "vitest";

import { buildReceiptText, type Receipt } from "@/lib/pos/receipt";

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    order_number: 42,
    reference: "abcdef12-0000-0000-0000-000000000000",
    placed_at: "2026-07-24T05:30:00.000Z",
    items: [
      { item_name: "Brownie", quantity: 2, unit_price: 100 },
      { item_name: "Cookie", quantity: 1, unit_price: 70 },
    ],
    subtotal: 270,
    discount: 0,
    total: 270,
    payment_method: "cash",
    change_due: null,
    synced: true,
    ...overrides,
  };
}

describe("buildReceiptText", () => {
  it("includes the shop name and order number", () => {
    const text = buildReceiptText(makeReceipt());
    expect(text).toContain("The 11th Bean");
    expect(text).toContain("Order #42");
  });

  it("lists each item with quantity and line price", () => {
    const text = buildReceiptText(makeReceipt());
    expect(text).toContain("2 x Brownie");
    expect(text).toContain("1 x Cookie");
    // 2 x 100 = 200 shown as the line total
    expect(text).toMatch(/2 x Brownie\s+₹\s?200/);
  });

  it("shows total and payment method in upper case", () => {
    const text = buildReceiptText(makeReceipt({ payment_method: "upi" }));
    expect(text).toMatch(/Total\s+₹\s?270/);
    expect(text).toContain("Paid via  UPI");
  });

  it("omits the discount line when there is no discount", () => {
    expect(buildReceiptText(makeReceipt())).not.toContain("Discount");
  });

  it("shows the discount line when a discount applies", () => {
    const text = buildReceiptText(
      makeReceipt({ discount: 20, total: 250 }),
    );
    expect(text).toMatch(/Discount\s+-₹\s?20/);
  });

  it("shows change for a cash sale that was tendered over", () => {
    const text = buildReceiptText(makeReceipt({ change_due: 30 }));
    expect(text).toMatch(/Change\s+₹\s?30/);
  });

  it("marks an offline sale and uses the reference when no order number", () => {
    const text = buildReceiptText(
      makeReceipt({ order_number: null, synced: false }),
    );
    expect(text).toContain("Ref abcdef12");
    expect(text).toContain("(offline — will sync to records)");
  });

  it("includes an optional customer name", () => {
    const text = buildReceiptText(makeReceipt({ customer_name: "Asha" }));
    expect(text).toContain("Customer: Asha");
  });
});
