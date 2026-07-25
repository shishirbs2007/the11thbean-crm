import { loadConfig, secretsOf } from "./config.ts";
import { createLogger } from "./logger.ts";
import { getOrders } from "./petpooja/orders.ts";
import type { NormalizedOrder, OrdersResult } from "./petpooja/order-types.ts";

// READ-ONLY order diagnostic:
//   npm run petpooja:orders -- --from 2026-07-25 --to 2026-07-25 [--json]
// Prints a concise summary and a compact, sanitized view of the orders. It
// never prints authentication material (user object, rest_id, secrets).

function parseArgs(argv: string[]): { from?: string; to?: string; json: boolean } {
  const out: { from?: string; to?: string; json: boolean } = { json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") out.from = argv[++i];
    else if (argv[i] === "--to") out.to = argv[++i];
    else if (argv[i] === "--json") out.json = true;
  }
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function maskMobile(mobile: string | null): string {
  if (!mobile) return "—";
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 2) return "****";
  return `****${digits.slice(-2)}`;
}

function maskName(name: string | null): string {
  if (!name) return "—";
  return name.length <= 2 ? `${name[0] ?? ""}*` : `${name.slice(0, 2)}***`;
}

function summarize(result: OrdersResult): string {
  const revenue = result.orders.reduce((sum, o) => sum + (o.grandTotal ?? 0), 0);
  const customers = result.orders.filter((o) => o.customerName || o.customerMobile).length;
  const items = result.orders.reduce((sum, o) => sum + o.items.length, 0);
  const lines: string[] = [];
  lines.push("PetPooja Orders");
  lines.push("---------------");
  lines.push(`Range:               ${result.fromDate} → ${result.toDate}`);
  lines.push(`Orders:              ${result.orders.length}`);
  lines.push(`Total records:       ${result.totalRecords ?? "unknown"}`);
  lines.push(`Revenue:             ${revenue.toFixed(2)}`);
  lines.push(`Customers identified:${customers}`);
  lines.push(`Items:               ${items}`);
  lines.push(`Pages fetched:       ${result.pagesFetched}`);
  lines.push(`Duplicates removed:  ${result.duplicatesRemoved}`);
  return lines.join("\n");
}

function renderOrder(o: NormalizedOrder): string {
  const id = o.petpoojaOrderId ?? o.invoiceNo ?? "?";
  const parts = [
    `#${id}`,
    o.orderDateTime ?? "",
    o.orderType ?? "",
    `${o.grandTotal ?? "?"}`,
    maskName(o.customerName),
    maskMobile(o.customerMobile),
    `${o.items.length} item(s)`,
    o.paymentStatus ?? "",
  ];
  return "  " + parts.filter(Boolean).join("  ·  ");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.from || !args.to || !DATE_RE.test(args.from) || !DATE_RE.test(args.to)) {
    process.stderr.write("usage: petpooja:orders -- --from YYYY-MM-DD --to YYYY-MM-DD [--json]\n");
    process.exit(2);
    return;
  }

  const config = loadConfig();
  const logger = createLogger({ level: "warn", secrets: secretsOf(config), write: () => {} });
  const result = await getOrders(config, { fromDate: args.from, toDate: args.to }, logger);

  if (args.json) {
    // Raw payloads are preserved in the result but omitted from stdout to avoid
    // dumping PII; callers who need raw can use the bridge programmatically.
    const safe = {
      ...result,
      orders: result.orders.map((o) => ({ ...o, raw: undefined, items: o.items.map((i) => ({ ...i, raw: undefined })) })),
    };
    process.stdout.write(JSON.stringify(safe, null, 2) + "\n");
    return;
  }

  const lines = [summarize(result), "", "Orders (sanitized):"];
  for (const order of result.orders) lines.push(renderOrder(order));
  process.stdout.write(lines.join("\n") + "\n");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(`petpooja:orders failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

export { parseArgs, summarize, maskMobile, maskName, renderOrder };
