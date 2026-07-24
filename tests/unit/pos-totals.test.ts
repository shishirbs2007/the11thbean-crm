import { describe, expect, it } from "vitest";

import {
  computeChange,
  computeSubtotal,
  computeTotal,
  roundMoney,
  startOfTodayISO,
  sumOrderTotals,
} from "@/lib/pos/totals";

describe("computeSubtotal", () => {
  it("sums price times quantity across lines", () => {
    expect(
      computeSubtotal([
        { unit_price: 100, quantity: 1 },
        { unit_price: 60, quantity: 2 },
      ]),
    ).toBe(220);
  });

  it("reflects quantity changes", () => {
    expect(computeSubtotal([{ unit_price: 90, quantity: 3 }])).toBe(270);
  });

  it("is zero for an empty cart", () => {
    expect(computeSubtotal([])).toBe(0);
  });

  it("rounds to paise", () => {
    expect(computeSubtotal([{ unit_price: 33.33, quantity: 3 }])).toBe(99.99);
  });
});

describe("computeTotal", () => {
  it("subtracts a discount", () => {
    expect(computeTotal(220, 20)).toBe(200);
  });

  it("never goes below zero", () => {
    expect(computeTotal(100, 500)).toBe(0);
  });

  it("ignores a negative discount", () => {
    expect(computeTotal(100, -50)).toBe(100);
  });
});

describe("computeChange", () => {
  it("returns null when nothing is tendered", () => {
    expect(computeChange(100, null)).toBeNull();
  });

  it("computes change for cash", () => {
    expect(computeChange(180, 200)).toBe(20);
  });

  it("is negative when the tender is short", () => {
    expect(computeChange(200, 150)).toBe(-50);
  });

  it("is zero for exact cash", () => {
    expect(computeChange(90, 90)).toBe(0);
  });
});

describe("roundMoney", () => {
  it("rounds to two decimals", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });
});

describe("sumOrderTotals", () => {
  it("adds up today's order totals", () => {
    expect(sumOrderTotals([{ total: 100 }, { total: 60 }, { total: 90 }])).toBe(250);
  });

  it("is zero when there are no sales today", () => {
    expect(sumOrderTotals([])).toBe(0);
  });
});

describe("startOfTodayISO", () => {
  it("returns IST midnight as UTC (previous day 18:30Z)", () => {
    // 2026-07-24 09:00 IST == 2026-07-24 03:30Z
    const now = new Date("2026-07-24T03:30:00.000Z");
    expect(startOfTodayISO(now)).toBe("2026-07-23T18:30:00.000Z");
  });

  it("keeps a late-evening IST sale on the same IST day", () => {
    // 2026-07-24 23:00 IST == 2026-07-24 17:30Z, still IST-24th
    const now = new Date("2026-07-24T17:30:00.000Z");
    expect(startOfTodayISO(now)).toBe("2026-07-23T18:30:00.000Z");
  });
});
