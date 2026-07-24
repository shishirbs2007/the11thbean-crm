// Pure money/total helpers for the POS. Kept free of React/DOM so they can be
// unit-tested directly and reused by both the register and the page.

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeSubtotal(
  lines: { unit_price: number; quantity: number }[],
): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + line.unit_price * line.quantity, 0),
  );
}

// Total never drops below zero, even if a discount exceeds the subtotal.
export function computeTotal(subtotal: number, discount: number): number {
  return Math.max(0, roundMoney(subtotal - Math.max(0, discount)));
}

// Change for a cash sale. Returns null when nothing has been tendered yet.
// A negative result means the tendered amount is short of the total.
export function computeChange(
  total: number,
  tendered: number | null,
): number | null {
  if (tendered === null) return null;
  return roundMoney(tendered - total);
}

// Start-of-day for "today's sales", in the café's timezone (IST, UTC+5:30,
// no DST). Returned as a UTC ISO string suitable for a `placed_at >= …` query.
export function startOfTodayISO(now: Date = new Date(), tzOffsetMinutes = 330): string {
  const shifted = new Date(now.getTime() + tzOffsetMinutes * 60_000);
  const midnightUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(midnightUtc - tzOffsetMinutes * 60_000).toISOString();
}

export function sumOrderTotals(orders: { total: number }[]): number {
  return roundMoney(orders.reduce((sum, order) => sum + order.total, 0));
}
