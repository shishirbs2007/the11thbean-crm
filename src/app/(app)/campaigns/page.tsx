import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  missingRationale,
  nextCampaignStep,
  type CampaignStatus,
} from "@/lib/intelligence/audiences";
import {
  advanceCampaign,
  createCampaign,
  saveRationale,
  toggleAutomation,
} from "./actions";

type Campaign = {
  id: string;
  name: string;
  description: string | null;
  channel: string;
  purpose: string;
  status: CampaignStatus;
  audience_id: string | null;
  rationale_why_them: string | null;
  rationale_why_now: string | null;
  rationale_why_message: string | null;
  hoped_outcome: string | null;
};

type Outcome = {
  campaign_id: string;
  reached: number;
  delivered: number;
  visits_generated: number;
  event_attendance: number;
  referrals_generated: number;
};

type Automation = {
  id: string;
  name: string;
  explanation: string;
  channel: string;
  purpose: string;
  is_active: boolean;
};

export default async function CampaignsPage() {
  const { supabase } = await requireUser();

  const [campaignsResult, audiencesResult, outcomesResult, automationsResult] =
    await Promise.all([
      supabase
        .from("communication_campaigns")
        .select(
          "id, name, description, channel, purpose, status, audience_id, rationale_why_them, rationale_why_now, rationale_why_message, hoped_outcome",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("audiences")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
      supabase.from("campaign_outcomes").select("*"),
      supabase
        .from("hospitality_automations")
        .select("id, name, explanation, channel, purpose, is_active")
        .order("name"),
    ]);

  const campaigns = (campaignsResult.data ?? []) as Campaign[];
  const audiences = audiencesResult.data ?? [];
  const automations = (automationsResult.data ?? []) as Automation[];
  const outcomes = new Map(
    ((outcomesResult.data ?? []) as Outcome[]).map((row) => [
      row.campaign_id,
      row,
    ]),
  );

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Communications"
        title="Campaigns"
        description="Nothing goes out until the café can say why this guest, why now, why this message, and what it hopes for."
      />

      <ErrorPanel
        messages={[
          campaignsResult.error?.message,
          outcomesResult.error?.message,
          automationsResult.error?.message,
        ]}
      />

      <div className="mt-8">
        <Section
          title="Start a campaign"
          description="A draft is just a name and a channel. The reasoning comes next."
        >
          <form action={createCampaign} className="grid gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              placeholder="Campaign name"
              className="rounded-xl border px-3 py-2"
            />
            <input
              name="description"
              placeholder="What this is about"
              className="rounded-xl border px-3 py-2"
            />
            <select
              aria-label="Channel"
              name="channel"
              defaultValue="email"
              className="rounded-xl border px-3 py-2"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
            </select>
            <select
              aria-label="Choose an audience"
              name="audience_id"
              className="rounded-xl border px-3 py-2"
            >
              <option value="">Choose an audience later</option>
              {audiences.map((audience) => (
                <option key={audience.id} value={audience.id}>
                  {audience.name}
                </option>
              ))}
            </select>
            <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white sm:col-span-2">
              Create draft
            </SubmitButton>
          </form>
        </Section>
      </div>

      <div className="mt-8 space-y-6">
        {campaigns.length === 0 ? (
          <Section
            title="No campaigns yet"
            description="Nothing has been drafted."
          >
            <p className="text-neutral-600">
              No campaigns. Create a draft above.
            </p>
          </Section>
        ) : (
          campaigns.map((campaign) => {
            const missing = missingRationale(campaign);
            const step = nextCampaignStep(campaign.status);
            const outcome = outcomes.get(campaign.id);
            const save = saveRationale.bind(null, campaign.id);
            const advance = advanceCampaign.bind(null, campaign.id);

            return (
              <Section
                key={campaign.id}
                title={campaign.name}
                description={`${campaign.status} · ${campaign.channel} · ${campaign.purpose}`}
              >
                {missing.length > 0 ? (
                  <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">Before this can be reviewed:</p>
                    <ul className="mt-2 list-disc pl-5">
                      {missing.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-xl bg-neutral-50 p-4 text-sm">
                    Ready. {campaign.rationale_why_them}
                  </p>
                )}

                {outcome && outcome.reached > 0 && (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      ["Reached", outcome.reached],
                      ["Delivered", outcome.delivered],
                      ["Visits after", outcome.visits_generated],
                      ["Came to events", outcome.event_attendance],
                      ["Referrals", outcome.referrals_generated],
                    ].map(([label, count]) => (
                      <div key={label} className="rounded-xl border p-3">
                        <p className="text-xs text-neutral-500">{label}</p>
                        <p className="mt-1 text-xl font-semibold">{count}</p>
                      </div>
                    ))}
                  </div>
                )}

                <form action={save} className="mt-5 grid gap-3">
                  <select
                    aria-label="Choose an audience"
                    name="audience_id"
                    defaultValue={campaign.audience_id || ""}
                    className="rounded-xl border px-3 py-2"
                  >
                    <option value="">Choose an audience</option>
                    {audiences.map((audience) => (
                      <option key={audience.id} value={audience.id}>
                        {audience.name}
                      </option>
                    ))}
                  </select>
                  <textarea
                    name="rationale_why_them"
                    defaultValue={campaign.rationale_why_them || ""}
                    placeholder="Why these guests?"
                    className="min-h-20 rounded-xl border p-3"
                  />
                  <textarea
                    name="rationale_why_now"
                    defaultValue={campaign.rationale_why_now || ""}
                    placeholder="Why now?"
                    className="min-h-20 rounded-xl border p-3"
                  />
                  <textarea
                    name="rationale_why_message"
                    defaultValue={campaign.rationale_why_message || ""}
                    placeholder="Why this message?"
                    className="min-h-20 rounded-xl border p-3"
                  />
                  <textarea
                    name="hoped_outcome"
                    defaultValue={campaign.hoped_outcome || ""}
                    placeholder="What outcome do we hope for?"
                    className="min-h-20 rounded-xl border p-3"
                  />
                  <SubmitButton className="rounded-xl border px-4 py-2">
                    Save reasoning
                  </SubmitButton>
                </form>

                {step && (
                  <form action={advance} className="mt-3">
                    <input
                      type="hidden"
                      name="next_status"
                      value={step.status}
                    />
                    <SubmitButton className="rounded-xl bg-black px-4 py-2 text-white">
                      {step.label}
                    </SubmitButton>
                  </form>
                )}
              </Section>
            );
          })
        )}
      </div>

      <div className="mt-8">
        <Section
          title="Hospitality automations"
          description="Every automation says what it does and when. All ship switched off, so a café turns them on deliberately."
        >
          <ul className="space-y-3">
            {automations.map((automation) => {
              const toggle = toggleAutomation.bind(null, automation.id);

              return (
                <li
                  key={automation.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                >
                  <div>
                    <p className="font-semibold">{automation.name}</p>
                    <p className="mt-1 text-sm text-neutral-600">
                      {automation.explanation}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                      {automation.channel} · {automation.purpose} ·{" "}
                      {automation.is_active ? "on" : "off"}
                    </p>
                  </div>
                  <form action={toggle}>
                    <input
                      type="hidden"
                      name="is_active"
                      value={automation.is_active ? "false" : "true"}
                    />
                    <SubmitButton
                      pendingText="Saving..."
                      className="rounded-xl border px-4 py-2 text-sm"
                    >
                      {automation.is_active ? "Turn off" : "Turn on"}
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        </Section>
      </div>
    </main>
  );
}
