import { requireUser } from "@/lib/auth";
import { ErrorPanel } from "@/components/notifications/error-panel";
import { Section } from "@/components/customer360/section";
import { PageHeader } from "@/components/platform/page-header";
import { SubmitButton } from "@/components/submit-button";
import {
  describeAudience,
  parseAudienceExplanation,
  parseAudienceRules,
  type AudienceRuleDefinition,
} from "@/lib/intelligence/audiences";
import { createAudience, deleteAudience } from "./actions";

type Audience = {
  id: string;
  name: string;
  description: string | null;
  rules: unknown;
  match_mode: string;
  channel: string;
  purpose: string;
};

export default async function AudiencesPage() {
  const { supabase } = await requireUser();

  const [audiencesResult, rulesResult, purposesResult, communitiesResult] =
    await Promise.all([
      supabase
        .from("audiences")
        .select("id, name, description, rules, match_mode, channel, purpose")
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("audience_rules")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("label"),
      supabase.from("consent_purposes").select("key, label").order("label"),
      supabase
        .from("communities")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
    ]);

  const audiences = (audiencesResult.data ?? []) as Audience[];
  const rules = (rulesResult.data ?? []) as AudienceRuleDefinition[];
  const purposes = purposesResult.data ?? [];
  const communities = communitiesResult.data ?? [];

  // Each saved audience explains itself against today's data, so staff see who
  // it would actually reach right now rather than when it was written.
  const explanations = await Promise.all(
    audiences.map((audience) =>
      supabase
        .rpc("explain_audience", {
          audience_rules_json: audience.rules,
          match_mode: audience.match_mode,
          target_channel: audience.channel,
          target_purpose: audience.purpose,
        })
        .then((result) => parseAudienceExplanation(result.data)),
    ),
  );

  const categories = [...new Set(rules.map((rule) => rule.category))];

  return (
    <main className="mx-auto max-w-7xl px-5 py-10">
      <PageHeader
        eyebrow="Communications"
        title="Audiences"
        description="Who a message is for, and why. Audiences are built from rules and always explain themselves."
      />

      <ErrorPanel
        messages={[audiencesResult.error?.message, rulesResult.error?.message]}
      />

      <div className="mt-8">
        <Section
          title="Saved audiences"
          description="Each one is evaluated live, so the numbers are today's."
        >
          {audiences.length === 0 ? (
            <p className="text-neutral-600">
              No audiences yet. Build one below.
            </p>
          ) : (
            <ul className="space-y-3">
              {audiences.map((audience, index) => {
                const archive = deleteAudience.bind(null, audience.id);
                const explanation = explanations[index];
                const audienceRules = parseAudienceRules(audience.rules);

                return (
                  <li
                    key={audience.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-4"
                  >
                    <div>
                      <p className="font-semibold">{audience.name}</p>
                      {audience.description && (
                        <p className="mt-1 text-sm text-neutral-600">
                          {audience.description}
                        </p>
                      )}
                      <p className="mt-2 text-sm">
                        {describeAudience(explanation)}
                      </p>
                      <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                        {audience.channel} · {audience.purpose} ·{" "}
                        {audience.match_mode === "all"
                          ? "matches every rule"
                          : "matches any rule"}{" "}
                        · {audienceRules.length} rule
                        {audienceRules.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <form action={archive}>
                      <SubmitButton
                        pendingText="Archiving..."
                        className="rounded-xl border px-3 py-2 text-sm"
                      >
                        Archive
                      </SubmitButton>
                    </form>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-8">
        <Section
          title="Build an audience"
          description="Combine rules freely. Anyone who has not consented to this channel and purpose is excluded automatically."
        >
          <form action={createAudience} className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="name"
                required
                placeholder="Audience name"
                className="rounded-xl border px-3 py-2"
              />
              <input
                name="description"
                placeholder="What this audience is for"
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
                <option value="internal">Internal reminder</option>
              </select>
              <select
                aria-label="Purpose"
                name="purpose"
                defaultValue="marketing"
                className="rounded-xl border px-3 py-2"
              >
                {purposes.map((purpose) => (
                  <option key={purpose.key} value={purpose.key}>
                    {purpose.label}
                  </option>
                ))}
              </select>
              <select
                aria-label="How rules combine"
                name="match_mode"
                defaultValue="any"
                className="rounded-xl border px-3 py-2 sm:col-span-2"
              >
                <option value="any">Include guests matching any rule</option>
                <option value="all">Only guests matching every rule</option>
              </select>
            </div>

            {categories.map((category) => (
              <fieldset key={category} className="rounded-xl border p-4">
                <legend className="px-2 text-sm font-medium capitalize">
                  {category}
                </legend>
                <div className="grid gap-3">
                  {rules
                    .filter((rule) => rule.category === category)
                    .map((rule) => (
                      <div
                        key={rule.key}
                        className="grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-center"
                      >
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            name="rule_key"
                            value={rule.key}
                          />
                          <span className="font-medium">{rule.label}</span>
                        </label>
                        <span className="text-sm text-neutral-600">
                          {rule.description}
                        </span>
                        {rule.accepts_days && (
                          <input
                            name={`days_${rule.key}`}
                            type="number"
                            min="1"
                            placeholder="Days"
                            className="w-28 rounded-xl border px-3 py-2"
                          />
                        )}
                        {rule.accepts_reference_id && (
                          <select
                            aria-label={`Which community for "${rule.label}"`}
                            name={`reference_id_${rule.key}`}
                            className="rounded-xl border px-3 py-2"
                          >
                            <option value="">Any</option>
                            {communities.map((community) => (
                              <option key={community.id} value={community.id}>
                                {community.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {rule.key === "favourite_item" && (
                          <input
                            name={`reference_text_${rule.key}`}
                            placeholder="Item, e.g. pour-over"
                            className="rounded-xl border px-3 py-2"
                          />
                        )}
                      </div>
                    ))}
                </div>
              </fieldset>
            ))}

            <SubmitButton className="rounded-xl bg-black px-4 py-3 text-white">
              Create audience
            </SubmitButton>
          </form>
        </Section>
      </div>
    </main>
  );
}
