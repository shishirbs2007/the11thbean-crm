/**
 * CSV order import.
 *
 * Almost every till can export a CSV, including the ones with no API at all.
 * This is the adapter a café can use on day one, without credentials, without
 * a vendor agreement, and without waiting for an integration to be built.
 *
 * The parser is deliberately forgiving about column naming — tills disagree
 * about whether it is "total", "amount" or "net_amount" — and deliberately
 * strict about what it will invent, which is nothing.
 */

export type ParsedOrderItem = {
  item_name: string;
  category: string | null;
  quantity: number;
  unit_price: number;
};

export type ParsedOrder = {
  external_id: string;
  occurred_at: string;
  phone: string | null;
  email: string | null;
  net_amount: number;
  party_size: number;
  items: ParsedOrderItem[];
};

export type ParseResult = {
  orders: ParsedOrder[];
  /** Rows that could not be used, with the reason, so nothing fails silently. */
  rejected: { line: number; reason: string }[];
};

/** Column aliases seen across common tills. */
const COLUMNS: Record<string, string[]> = {
  external_id: ["external_id", "order_id", "order", "bill_no", "invoice", "receipt"],
  occurred_at: ["occurred_at", "date", "datetime", "timestamp", "order_date", "time"],
  phone: ["phone", "mobile", "contact", "customer_phone", "phone_number"],
  email: ["email", "customer_email", "mail"],
  net_amount: ["net_amount", "total", "amount", "net", "grand_total", "bill_amount"],
  party_size: ["party_size", "covers", "guests", "pax"],
  item_name: ["item_name", "item", "product", "description", "dish"],
  category: ["category", "item_category", "type", "group"],
  quantity: ["quantity", "qty", "count"],
  unit_price: ["unit_price", "price", "rate", "item_price"],
};

function normaliseHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/**
 * Splits one CSV line, honouring double quotes so that an item called
 * `Cortado, large` does not become two columns.
 */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function buildColumnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalised = headers.map(normaliseHeader);

  for (const [field, aliases] of Object.entries(COLUMNS)) {
    const index = normalised.findIndex((header) => aliases.includes(header));
    if (index >= 0) map.set(field, index);
  }

  return map;
}

function readNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  // Tills emit currency symbols, thousands separators and stray spaces.
  const cleaned = value.replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/**
 * Parses a till export into the provider-neutral shape `import_orders` accepts.
 *
 * One row per line item: rows sharing an order id are folded into one order,
 * which is how most tills export. An order's contact details and timestamp are
 * taken from the first row that carries them.
 */
export function parseOrderCsv(content: string): ParseResult {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    return {
      orders: [],
      rejected: [{ line: 0, reason: "File has no rows beneath the header" }],
    };
  }

  const columns = buildColumnMap(splitCsvLine(lines[0]));
  const rejected: ParseResult["rejected"] = [];

  if (!columns.has("external_id")) {
    return {
      orders: [],
      rejected: [
        {
          line: 1,
          reason:
            "No order identifier column found. Expected one of: order_id, bill_no, invoice, receipt.",
        },
      ],
    };
  }

  const byOrder = new Map<string, ParsedOrder>();

  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const cell = (field: string): string | undefined => {
      const position = columns.get(field);
      return position === undefined ? undefined : cells[position];
    };

    const externalId = cell("external_id")?.trim();

    if (!externalId) {
      rejected.push({ line: index + 1, reason: "Row has no order identifier" });
      continue;
    }

    const occurredAt = readDate(cell("occurred_at"));

    if (!occurredAt) {
      rejected.push({
        line: index + 1,
        reason: "Row has no readable date, so it cannot be placed in a guest's history",
      });
      continue;
    }

    let order = byOrder.get(externalId);

    if (!order) {
      order = {
        external_id: externalId,
        occurred_at: occurredAt,
        phone: cell("phone")?.trim() || null,
        email: cell("email")?.trim() || null,
        net_amount: 0,
        party_size: Math.max(1, Math.round(readNumber(cell("party_size"), 1))),
        items: [],
      };
      byOrder.set(externalId, order);
    }

    // Contact details may appear on any row of a multi-line order.
    order.phone = order.phone ?? (cell("phone")?.trim() || null);
    order.email = order.email ?? (cell("email")?.trim() || null);

    const itemName = cell("item_name")?.trim();

    if (itemName) {
      const quantity = Math.max(readNumber(cell("quantity"), 1), 0.01);
      const unitPrice = readNumber(cell("unit_price"), 0);

      order.items.push({
        item_name: itemName,
        category: cell("category")?.trim() || null,
        quantity,
        unit_price: unitPrice,
      });
    }
  }

  // The order total is whatever the till stated, falling back to the sum of
  // its lines. Never invented beyond that.
  for (const [externalId, order] of byOrder) {
    const stated = lines
      .slice(1)
      .map((line) => splitCsvLine(line))
      .find((cells) => cells[columns.get("external_id")!]?.trim() === externalId);

    const statedTotal = columns.has("net_amount")
      ? readNumber(stated?.[columns.get("net_amount")!], Number.NaN)
      : Number.NaN;

    order.net_amount = Number.isFinite(statedTotal)
      ? statedTotal
      : order.items.reduce(
          (total, item) => total + item.quantity * item.unit_price,
          0,
        );
  }

  return { orders: [...byOrder.values()], rejected };
}
