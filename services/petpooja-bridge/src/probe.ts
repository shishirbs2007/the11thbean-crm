import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, secretsOf } from "./config.ts";
import { createLogger } from "./logger.ts";
import { PetPoojaAdapter } from "./petpooja/adapter.ts";
import {
  baseMatrix,
  CAPABILITY_CATALOG,
  type CapabilityKey,
  type CapabilityMatrix,
} from "./petpooja/capabilities.ts";

// READ-ONLY capability probe. It reaches PetPooja only through idempotent reads
// (check_sync_code, inner_item_listing) and, if the extracted source tree is
// available locally, greps it for route names. It NEVER creates orders or
// customers, never triggers printing, never changes settings, never writes to
// PetPooja's database or files.

type ProbeResult = {
  localService: "AVAILABLE" | "UNAVAILABLE";
  versionCompatibility: "PASS" | "FAIL" | "UNKNOWN";
  restaurantIdentity: "AVAILABLE" | "UNKNOWN";
  syncCode: "PRESENT" | "REQUIRED";
  capabilities: CapabilityMatrix;
  discoveredRoutes: string[];
  notes: string[];
};

const ROUTE_RE = /\/petpooja_server\/([a-z0-9_]+)/gi;

function scanSourceForRoutes(root: string, notes: string[]): string[] {
  if (!existsSync(root)) {
    notes.push(`Extracted source not found at ${root} (expected only on the cafe machine).`);
    return [];
  }
  const routes = new Set<string>();
  let filesScanned = 0;
  const walk = (dir: string) => {
    if (filesScanned > 5000) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        walk(full);
      } else if (s.isFile() && s.size < 2_000_000) {
        filesScanned += 1;
        try {
          const text = readFileSync(full, "utf8");
          for (const m of text.matchAll(ROUTE_RE)) {
            if (m[1]) routes.add(m[1].toLowerCase());
          }
        } catch {
          // binary or unreadable — skip
        }
      }
    }
  };
  walk(root);
  return [...routes].sort();
}

// Map a discovered route name to the capability it most likely serves. Only
// used to upgrade "unknown" to "discovered" (category B) — never "confirmed".
function capabilityForRoute(route: string): CapabilityKey | null {
  if (/sync|health|status/.test(route)) return "status";
  if (/item|menu|product/.test(route)) return "menu.read";
  if (/customer|cust/.test(route)) return "customer.read";
  if (/bill/.test(route)) return "bill.read";
  if (/payment|pay/.test(route)) return "payment.read";
  if (/print/.test(route)) return "printing";
  if (/order|kot/.test(route)) return "order.read";
  return null;
}

async function probe(): Promise<ProbeResult> {
  const config = loadConfig();
  const logger = createLogger({
    level: "warn",
    secrets: secretsOf(config),
    write: () => {}, // keep the probe's own report clean on stdout
  });
  const adapter = new PetPoojaAdapter(config, logger);
  const notes: string[] = [];
  const capabilities = baseMatrix();

  const status = await adapter.getStatus();
  const localService = status.online ? "AVAILABLE" : "UNAVAILABLE";
  const restaurantIdentity =
    status.restaurant?.id || status.restaurant?.name ? "AVAILABLE" : "UNKNOWN";
  const syncCode = status.restaurant?.syncCodePresent ? "PRESENT" : "REQUIRED";
  let versionCompatibility: ProbeResult["versionCompatibility"] = "UNKNOWN";
  if (status.online && status.version) {
    versionCompatibility = status.version.compatible ? "PASS" : "FAIL";
    if (status.version.note) notes.push(status.version.note);
  }
  capabilities.status = status.capabilities.status;

  // Menu read — only attempted when the server is reachable and compatible.
  if (status.online && versionCompatibility !== "FAIL") {
    try {
      const menu = await adapter.getMenu();
      capabilities["menu.read"] = menu.items.length > 0 ? "confirmed" : "untested";
      notes.push(`inner_item_listing returned ${menu.items.length} item(s).`);
    } catch (err) {
      notes.push(`menu.read not validated: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Source discovery (read-only) to surface likely routes for the rest.
  const sourceRoot = process.env.PETPOOJA_SOURCE_DIR || "/tmp/petpooja-investigation/app";
  const discoveredRoutes = scanSourceForRoutes(sourceRoot, notes);
  for (const route of discoveredRoutes) {
    const key = capabilityForRoute(route);
    if (key && capabilities[key] === "unknown") capabilities[key] = "discovered";
  }

  return {
    localService,
    versionCompatibility,
    restaurantIdentity,
    syncCode,
    capabilities,
    discoveredRoutes,
    notes,
  };
}

function render(result: ProbeResult): string {
  const lines: string[] = [];
  lines.push("PetPooja Integration Capability Report");
  lines.push("");
  lines.push(`Local service:         ${result.localService}`);
  lines.push(`Version compatibility: ${result.versionCompatibility}`);
  lines.push(`Restaurant identity:   ${result.restaurantIdentity}`);
  lines.push(`Sync code:             ${result.syncCode}`);
  lines.push("");
  lines.push("Capabilities:");
  for (const cap of CAPABILITY_CATALOG) {
    const support = result.capabilities[cap.key];
    const endpoint = cap.endpoint ? `  (${cap.endpoint})` : "";
    lines.push(`  ${cap.key.padEnd(16)} ${support.toUpperCase().padEnd(11)}${endpoint}`);
  }
  if (result.discoveredRoutes.length > 0) {
    lines.push("");
    lines.push("Discovered /petpooja_server routes (from extracted source, unvalidated):");
    for (const route of result.discoveredRoutes) lines.push(`  - ${route}`);
  }
  if (result.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const note of result.notes) lines.push(`  * ${note}`);
  }
  lines.push("");
  lines.push("CONFIRMED = demonstrated live · DISCOVERED = seen but unvalidated · UNKNOWN = no evidence");
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  probe()
    .then((result) => {
      if (process.argv.includes("--json")) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(render(result) + "\n");
      }
    })
    .catch((err) => {
      process.stderr.write(`probe failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
}

export { probe, render, scanSourceForRoutes, capabilityForRoute };
export type { ProbeResult };
