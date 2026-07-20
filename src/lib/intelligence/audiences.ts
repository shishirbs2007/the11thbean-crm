/**
 * Audience intelligence.
 *
 * The rules themselves live in SQL so there is one definition of what
 * "regulars not seen recently" means. What lives here is how an audience
 * explains itself to the person about to send something.
 */

export type AudienceRuleDefinition = {
  key: string;
  label: string;
  description: string;
  category: string;
  accepts_days: boolean;
  accepts_reference_id: boolean;
};

export type AudienceRule = {
  key: string;
  days?: number;
  reference_id?: string;
  reference_text?: string;
};

export type AudienceReason = {
  key: string;
  label: string;
  count: number;
};

export type AudienceExplanation = {
  total: number;
  reasons: AudienceReason[];
};

/**
 * Normalises the jsonb from explain_audience, so a malformed or empty payload
 * reads as an empty audience rather than throwing on a send screen.
 */
export function parseAudienceExplanation(value: unknown): AudienceExplanation {
  if (!value || typeof value !== "object") return { total: 0, reasons: [] };

  const source = value as Record<string, unknown>;
  const rawReasons = Array.isArray(source.reasons) ? source.reasons : [];

  return {
    total: Number(source.total ?? 0),
    reasons: rawReasons.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const reason = entry as Record<string, unknown>;
      if (typeof reason.key !== "string") return [];

      return [
        {
          key: reason.key,
          label:
            typeof reason.label === "string" ? reason.label : reason.key,
          count: Number(reason.count ?? 0),
        },
      ];
    }),
  };
}

/**
 * Reads the rules out of whatever the database returned, ignoring anything
 * that is not a usable rule.
 */
export function parseAudienceRules(value: unknown): AudienceRule[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const rule = entry as Record<string, unknown>;
    if (typeof rule.key !== "string" || !rule.key) return [];

    const parsed: AudienceRule = { key: rule.key };

    const days = Number(rule.days);
    if (Number.isFinite(days) && days > 0) parsed.days = days;
    if (typeof rule.reference_id === "string" && rule.reference_id) {
      parsed.reference_id = rule.reference_id;
    }
    if (typeof rule.reference_text === "string" && rule.reference_text) {
      parsed.reference_text = rule.reference_text;
    }

    return [parsed];
  });
}

/**
 * "237 guests · 81 attended Book Club, 65 not seen in 30 days, ..."
 *
 * Counts overlap by design: a guest can be selected for several reasons, and
 * hiding that would make the audience less honest, not more.
 */
export function describeAudience(
  explanation: AudienceExplanation,
  limit = 5,
): string {
  if (explanation.total === 0) return "Nobody matches yet";

  const guests = `${explanation.total} guest${
    explanation.total === 1 ? "" : "s"
  }`;

  if (explanation.reasons.length === 0) return guests;

  const reasons = explanation.reasons
    .slice(0, limit)
    .map((reason) => `${reason.count} ${reason.label.toLowerCase()}`)
    .join(", ");

  return `${guests} · ${reasons}`;
}

export type CampaignStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "running"
  | "paused"
  | "completed"
  | "cancelled";

const LIFECYCLE: CampaignStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "running",
  "completed",
];

/**
 * The one step a campaign can take next, and what to call the button. Kept
 * deliberately linear: a café does not need a workflow engine, it needs
 * somebody to have read the message before it goes out.
 */
export function nextCampaignStep(
  status: CampaignStatus,
): { status: CampaignStatus; label: string } | null {
  switch (status) {
    case "draft":
      return { status: "review", label: "Send for review" };
    case "review":
      return { status: "approved", label: "Approve" };
    case "approved":
      return { status: "scheduled", label: "Schedule" };
    case "scheduled":
      return { status: "running", label: "Start sending" };
    case "running":
      return { status: "completed", label: "Mark complete" };
    default:
      return null;
  }
}

export function lifecycleProgress(status: CampaignStatus): number {
  const index = LIFECYCLE.indexOf(status);
  if (index < 0) return 0;
  return Math.round((index / (LIFECYCLE.length - 1)) * 100);
}

export type CampaignRationale = {
  rationale_why_them: string | null;
  rationale_why_now: string | null;
  rationale_why_message: string | null;
  hoped_outcome: string | null;
  audience_id: string | null;
};

/**
 * What is still missing before this campaign may be reviewed. The database
 * enforces the same rules; this is so staff see them before they hit a wall.
 */
export function missingRationale(campaign: CampaignRationale): string[] {
  const missing: string[] = [];

  if (!campaign.audience_id) missing.push("Choose an audience");
  if (!campaign.rationale_why_them?.trim()) missing.push("Why these guests?");
  if (!campaign.rationale_why_now?.trim()) missing.push("Why now?");
  if (!campaign.rationale_why_message?.trim()) {
    missing.push("Why this message?");
  }
  if (!campaign.hoped_outcome?.trim()) {
    missing.push("What outcome do we hope for?");
  }

  return missing;
}
