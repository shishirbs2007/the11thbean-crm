import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import { importOrderCsv, setAdapterEnabled } from "./actions";

type Adapter = {
  key: string;
  label: string;
  vendor: string;
  description: string | null;
  capabilities: string[];
  required_env: string[];
  is_enabled: boolean;
  health_status: string;
  last_error: string | null;
};

type ImportRun = {
  id: string;
  adapter_key: string;
  started_at: string;
  status: string;
  orders_seen: number;
  orders_imported: number;
  orders_skipped: number;
  guests_unmatched: number;
  summary: string | null;
};

type UnmatchedItem = {
  id: string;
  external_id: string;
  reason: string;
  payload: { phone?: string; email?: string; net_amount?: number };
  created_at: string;
};

export default async function IntegrationsPage() {
  const { supabase } = await requireUser();

  const [adaptersResult, importsResult, unmatchedResult, runsResult] =
    await Promise.all([
      supabase.from("integration_adapters").select("*").order("label"),
      supabase
        .from("import_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
      supabase
        .from("import_run_items")
        .select("id, external_id, reason, payload, created_at")
        .eq("outcome", "unmatched")
        .order("created_at", { ascending: false })
        .limit(15),
      supabase
        .from("integration_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(10),
    ]);

  const adapters = (adaptersResult.data ?? []) as Adapter[];
  const imports = (importsResult.data ?? []) as ImportRun[];
  const unmatched = (unmatchedResult.data ?? []) as UnmatchedItem[];
  const syncRuns = runsResult.data ?? [];

  const totalImported = imports.reduce(
    (total, run) => total + run.orders_imported,
    0,
  );

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Data connections"
        title="Integrations"
        description="Where the café's records come from. The CRM asks for a capability, never for a vendor."
      />

      <ErrorPanel
        messages={[
          adaptersResult.error?.message,
          importsResult.error?.message,
        ]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          ["Adapters enabled", `${adapters.filter((a) => a.is_enabled).length} of ${adapters.length}`],
          ["Orders imported", `${totalImported}`],
          ["Awaiting a guest", `${unmatched.length}`],
        ].map(([label, text]) => (
          <div key={label} className="rounded-2xl border p-5">
            <p className="text-sm text-neutral-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{text}</p>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <Section
          title="Import orders from the till"
          description="Export a CSV from any point of sale and upload it here. Re-uploading the same export changes nothing, so it is safe to repeat."
        >
          <form action={importOrderCsv} className="grid gap-3">
            <input
              type="file"
              name="orders_csv"
              accept=".csv,text/csv"
              required
              aria-label="Till export CSV file"
              className="rounded-xl border px-3 py-2"
            />
            <p className="text-sm text-neutral-600">
              Needs an order identifier and a date. It will recognise columns
              named order_id, bill_no, invoice or receipt, and reads item,
              quantity, price, phone and email where present.
            </p>
            <SubmitButton
              pendingText="Importing..."
              className="rounded-xl bg-black px-4 py-2 text-white"
            >
              Import orders
            </SubmitButton>
          </form>
        </Section>
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-2">
        <Section
          title="Import history"
          description="What each import found, and what it did with it."
        >
          {imports.length === 0 ? (
            <p className="text-neutral-600">
              Nothing imported yet. Until the till feeds the CRM, every visit
              has to be typed in during service.
            </p>
          ) : (
            <ul className="space-y-2">
              {imports.map((run) => (
                <li key={run.id} className="rounded-xl border p-3 text-sm">
                  <p
                    className={
                      run.status === "succeeded"
                        ? "font-medium"
                        : "font-medium text-amber-700"
                    }
                  >
                    {run.adapter_key} · {run.status} ·{" "}
                    {new Date(run.started_at).toLocaleString()}
                  </p>
                  <p className="mt-1 text-neutral-600">
                    {run.summary ?? "No summary recorded."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Orders without a guest"
          description="The till knows about these but the CRM cannot tell whose they are. Adding the guest with this phone number will attach future orders automatically."
        >
          {unmatched.length === 0 ? (
            <p className="text-neutral-600">
              Every imported order was matched to a guest.
            </p>
          ) : (
            <ul className="space-y-2">
              {unmatched.map((item) => (
                <li key={item.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">Order {item.external_id}</p>
                  <p className="mt-1 text-neutral-600">
                    {item.payload.phone || item.payload.email || "No contact details"}
                    {item.payload.net_amount
                      ? ` · ₹${Math.round(item.payload.net_amount)}`
                      : ""}
                  </p>
                  <Link
                    href="/customers/new"
                    className="mt-1 inline-block text-xs underline"
                  >
                    Add this guest
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Adapters"
          description="Each declares what it can do. One enabled without its credentials is treated as absent rather than failing when it matters."
        >
          <ul className="space-y-3">
            {adapters.map((adapter) => {
              const toggle = setAdapterEnabled.bind(null, adapter.key);

              return (
                <li key={adapter.key} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {adapter.label}{" "}
                        <span className="text-sm font-normal text-neutral-500">
                          {adapter.vendor}
                        </span>
                      </p>
                      <p className="mt-1 text-sm text-neutral-600">
                        {adapter.description}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                        {adapter.capabilities.join(" · ")}
                        {" · "}
                        {adapter.is_enabled ? "enabled" : "disabled"}
                        {adapter.health_status !== "unknown" &&
                          ` · ${adapter.health_status}`}
                      </p>
                      {adapter.required_env.length > 0 && (
                        <p className="mt-1 text-xs text-neutral-500">
                          Needs: {adapter.required_env.join(", ")}
                        </p>
                      )}
                      {adapter.last_error && (
                        <p className="mt-1 text-xs text-red-700">
                          {adapter.last_error}
                        </p>
                      )}
                    </div>
                    <form action={toggle}>
                      <input
                        type="hidden"
                        name="is_enabled"
                        value={adapter.is_enabled ? "false" : "true"}
                      />
                      <SubmitButton
                        pendingText="Saving..."
                        className="rounded-xl border px-4 py-2 text-sm"
                      >
                        {adapter.is_enabled ? "Disable" : "Enable"}
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>

      {syncRuns.length > 0 && (
        <div className="mt-8">
          <Section
            title="Provider sync history"
            description="Runs recorded by API-based integrations."
          >
            <ul className="space-y-2">
              {syncRuns.map((run) => (
                <li key={run.id} className="rounded-xl border p-3 text-sm">
                  <p className="font-medium">
                    {run.provider} · {run.sync_type}
                  </p>
                  <p className="mt-1 text-neutral-500">
                    {run.status} · {new Date(run.started_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </main>
  );
}
