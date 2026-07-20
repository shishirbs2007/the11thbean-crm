import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { PageHeader } from "@/components/platform/page-header";
import { createCampaign, createTemplate } from "./actions";

export default async function CommunicationsPage() {
  const { supabase } = await requireUser();

  const [
    { data: templatesData, error: templatesError },
    { data: campaignsData, error: campaignsError },
    { data: segmentsData },
    { data: providersData },
    { data: outboxData },
  ] = await Promise.all([
    supabase
      .from("communication_templates")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("communication_campaigns")
      .select(
        "id, name, channel, status, scheduled_at, communication_templates(name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("saved_segments")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("communication_provider_configs")
      .select("id, channel, provider, is_active")
      .order("channel"),
    supabase
      .from("communication_recipients")
      .select("status")
      .in("status", ["pending", "queued", "failed"]),
  ]);

  const templates = templatesData ?? [];
  const campaigns = campaignsData ?? [];
  const segments = segmentsData ?? [];
  const providers = providersData ?? [];
  const outbox = outboxData ?? [];

  const queued = outbox.filter(
    (item) => item.status === "pending" || item.status === "queued",
  ).length;
  const failed = outbox.filter((item) => item.status === "failed").length;

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Relationship communications"
        title="Email and WhatsApp"
        description="Own the decisioning, consent, templates, campaigns and history. Let specialist providers handle delivery."
      />

      <ErrorPanel
        messages={[templatesError?.message || campaignsError?.message]}
      />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Templates</p>
          <p className="mt-2 text-3xl font-semibold">{templates.length}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Campaigns</p>
          <p className="mt-2 text-3xl font-semibold">{campaigns.length}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Queued messages</p>
          <p className="mt-2 text-3xl font-semibold">{queued}</p>
        </article>
        <article className="rounded-2xl border p-5">
          <p className="text-sm text-neutral-500">Failed messages</p>
          <p className="mt-2 text-3xl font-semibold">{failed}</p>
        </article>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Create template</h2>
          <form action={createTemplate} className="mt-5 space-y-3">
            <input
              name="name"
              required
              placeholder="Template name"
              className="w-full rounded-xl border px-4 py-3"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                aria-label="Channel"
                name="channel"
                className="rounded-xl border px-4 py-3"
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <select
                aria-label="Category"
                name="category"
                className="rounded-xl border px-4 py-3"
              >
                <option value="relationship">Relationship</option>
                <option value="marketing">Marketing</option>
                <option value="transactional">Transactional</option>
              </select>
            </div>
            <input
              name="subject"
              placeholder="Email subject, when applicable"
              className="w-full rounded-xl border px-4 py-3"
            />
            <textarea
              name="body_text"
              required
              placeholder="Message body. Variables can use {{preferred_name}}."
              className="min-h-36 w-full rounded-xl border p-4"
            />
            <button className="rounded-xl bg-black px-4 py-3 text-white">
              Save template
            </button>
          </form>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Create campaign</h2>
          <form action={createCampaign} className="mt-5 space-y-3">
            <input
              name="name"
              required
              placeholder="Campaign name"
              className="w-full rounded-xl border px-4 py-3"
            />
            <textarea
              name="description"
              placeholder="Purpose and context"
              className="min-h-24 w-full rounded-xl border p-4"
            />
            <select
              aria-label="Channel"
              name="channel"
              className="w-full rounded-xl border px-4 py-3"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="mixed">Mixed</option>
            </select>
            <select
              aria-label="Choose a template"
              name="template_id"
              className="w-full rounded-xl border px-4 py-3"
            >
              <option value="">Choose template later</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.channel}
                </option>
              ))}
            </select>
            <select
              aria-label="Choose a segment"
              name="segment_id"
              className="w-full rounded-xl border px-4 py-3"
            >
              <option value="">Choose audience later</option>
              {segments.map((segment) => (
                <option key={segment.id} value={segment.id}>
                  {segment.name}
                </option>
              ))}
            </select>
            <button className="rounded-xl bg-black px-4 py-3 text-white">
              Save draft campaign
            </button>
          </form>
        </section>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Recent campaigns</h2>
          <div className="mt-5 space-y-3">
            {campaigns.length === 0 ? (
              <p className="text-sm text-neutral-500">No campaigns yet.</p>
            ) : (
              campaigns.map((campaign) => {
                const template = Array.isArray(campaign.communication_templates)
                  ? campaign.communication_templates[0]
                  : campaign.communication_templates;

                return (
                  <div
                    key={campaign.id}
                    className="rounded-xl bg-neutral-50 p-4 text-sm"
                  >
                    <p className="font-medium">{campaign.name}</p>
                    <p className="mt-1 text-neutral-500">
                      {campaign.channel} · {campaign.status}
                      {template ? ` · ${template.name}` : ""}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="rounded-2xl border p-6">
          <h2 className="text-lg font-semibold">Delivery providers</h2>
          <div className="mt-5 space-y-3">
            {providers.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No provider configured. Email and WhatsApp delivery remain
                disabled until credentials are added.
              </p>
            ) : (
              providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex justify-between rounded-xl bg-neutral-50 p-4 text-sm"
                >
                  <span>
                    {provider.channel} · {provider.provider}
                  </span>
                  <span>{provider.is_active ? "Active" : "Inactive"}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
