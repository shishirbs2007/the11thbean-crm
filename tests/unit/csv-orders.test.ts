import { describe, expect, it } from "vitest";

import { parseOrderCsv, splitCsvLine } from "@/lib/integrations/csv-orders";

describe("splitCsvLine", () => {
  it("splits plain cells", () => {
    expect(splitCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a quoted comma inside one cell", () => {
    expect(splitCsvLine('T-1,"Cortado, large",220')).toEqual([
      "T-1",
      "Cortado, large",
      "220",
    ]);
  });

  it("unescapes a doubled quote", () => {
    expect(splitCsvLine('a,"He said ""hello""",b')).toEqual([
      "a",
      'He said "hello"',
      "b",
    ]);
  });

  it("preserves empty cells", () => {
    expect(splitCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("parseOrderCsv", () => {
  const header = "order_id,date,phone,item,category,qty,price,total";

  it("folds multiple line items into one order", () => {
    const { orders } = parseOrderCsv(
      [
        header,
        "T-1,2026-07-19T09:15:00Z,+919000000001,Flat White,coffee,1,220,420",
        "T-1,2026-07-19T09:15:00Z,+919000000001,Croissant,bakery,1,200,420",
      ].join("\n"),
    );

    expect(orders).toHaveLength(1);
    expect(orders[0].items).toHaveLength(2);
    expect(orders[0].net_amount).toBe(420);
  });

  it("keeps separate orders separate", () => {
    const { orders } = parseOrderCsv(
      [
        header,
        "T-1,2026-07-19T09:00:00Z,+919000000001,Flat White,coffee,1,220,220",
        "T-2,2026-07-19T10:00:00Z,+919000000002,Filter,coffee,1,140,140",
      ].join("\n"),
    );

    expect(orders.map((order) => order.external_id)).toEqual(["T-1", "T-2"]);
  });

  it("accepts the column names different tills use", () => {
    const { orders } = parseOrderCsv(
      [
        "Bill No,Timestamp,Mobile,Dish,Group,Count,Rate,Grand Total",
        "B-9,2026-07-19T09:00:00Z,+919000000001,Cortado,coffee,2,240,480",
      ].join("\n"),
    );

    expect(orders[0].external_id).toBe("B-9");
    expect(orders[0].items[0].item_name).toBe("Cortado");
    expect(orders[0].items[0].quantity).toBe(2);
    expect(orders[0].net_amount).toBe(480);
  });

  it("strips currency symbols and separators from money", () => {
    const { orders } = parseOrderCsv(
      [
        header,
        'T-1,2026-07-19T09:00:00Z,+919000000001,Cake,bakery,1,"₹1,250","₹1,250"',
      ].join("\n"),
    );

    expect(orders[0].net_amount).toBe(1250);
    expect(orders[0].items[0].unit_price).toBe(1250);
  });

  it("falls back to summing line items when no total is given", () => {
    const { orders } = parseOrderCsv(
      [
        "order_id,date,item,qty,price",
        "T-1,2026-07-19T09:00:00Z,Flat White,2,220",
      ].join("\n"),
    );

    expect(orders[0].net_amount).toBe(440);
  });

  it("rejects a row with no readable date rather than guessing", () => {
    const { orders, rejected } = parseOrderCsv(
      [header, "T-1,not-a-date,+919000000001,Flat White,coffee,1,220,220"].join(
        "\n",
      ),
    );

    expect(orders).toHaveLength(0);
    expect(rejected[0].reason).toContain("no readable date");
    expect(rejected[0].line).toBe(2);
  });

  it("rejects a row with no order identifier", () => {
    const { rejected } = parseOrderCsv(
      [header, ",2026-07-19T09:00:00Z,+919000000001,Flat White,coffee,1,220,220"].join(
        "\n",
      ),
    );

    expect(rejected[0].reason).toContain("no order identifier");
  });

  it("refuses a file with no identifier column, naming what it wanted", () => {
    const { orders, rejected } = parseOrderCsv(
      ["date,item,price", "2026-07-19T09:00:00Z,Flat White,220"].join("\n"),
    );

    expect(orders).toHaveLength(0);
    expect(rejected[0].reason).toContain("order_id");
  });

  it("handles an empty file", () => {
    expect(parseOrderCsv("").orders).toEqual([]);
    expect(parseOrderCsv(header).rejected[0].reason).toContain("no rows");
  });

  it("picks up contact details from any row of a multi-line order", () => {
    const { orders } = parseOrderCsv(
      [
        header,
        "T-1,2026-07-19T09:00:00Z,,Flat White,coffee,1,220,420",
        "T-1,2026-07-19T09:00:00Z,+919000000001,Croissant,bakery,1,200,420",
      ].join("\n"),
    );

    expect(orders[0].phone).toBe("+919000000001");
  });

  it("defaults party size to one and never below", () => {
    const { orders } = parseOrderCsv(
      [
        "order_id,date,pax,item,qty,price",
        "T-1,2026-07-19T09:00:00Z,0,Flat White,1,220",
      ].join("\n"),
    );

    expect(orders[0].party_size).toBe(1);
  });

  it("tolerates carriage returns from a Windows export", () => {
    const { orders } = parseOrderCsv(
      [header, "T-1,2026-07-19T09:00:00Z,,Flat White,coffee,1,220,220"].join(
        "\r\n",
      ),
    );

    expect(orders).toHaveLength(1);
  });
});
