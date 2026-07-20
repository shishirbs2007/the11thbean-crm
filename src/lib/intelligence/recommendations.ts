/**
 * Recommendation presentation.
 *
 * The reasoning is computed in SQL, deterministically, from records the café
 * already keeps. Nothing here decides anything — it normalises the payload and
 * words it for whoever is about to walk up to a guest.
 */

export type Recommendation = {
  person_id: string;
  first_name: string;
  last_name: string | null;
  preferred_name: string | null;
  recommendation_key: string;
  label: string;
  category: "risk" | "opportunity" | "care" | "community" | "event";
  priority: number;
  why: string;
  evidence: Record<string, unknown>;
  confidence: number;
  suggested_action: string;
};

export type NextBestAction = {
  recommendation: string;
  label: string;
  category: string;
  why: string;
  evidence: Record<string, unknown>;
  confidence: number;
  suggested_action: string;
};

const FALLBACK: NextBestAction = {
  recommendation: "none",
  label: "Nothing outstanding",
  category: "care",
  why: "The café has no open concerns or opportunities for this guest.",
  evidence: {},
  confidence: 1,
  suggested_action: "Greet them by name and ask how they are.",
};

/**
 * Normalises next_best_action, falling back to a warm default rather than an
 * empty panel. A guest with nothing flagged still deserves to be greeted.
 */
export function parseNextBestAction(value: unknown): NextBestAction {
  if (!value || typeof value !== "object") return FALLBACK;

  const source = value as Record<string, unknown>;

  if (typeof source.suggested_action !== "string") return FALLBACK;

  return {
    recommendation:
      typeof source.recommendation === "string" ? source.recommendation : "none",
    label: typeof source.label === "string" ? source.label : FALLBACK.label,
    category:
      typeof source.category === "string" ? source.category : FALLBACK.category,
    why: typeof source.why === "string" ? source.why : FALLBACK.why,
    evidence:
      source.evidence && typeof source.evidence === "object"
        ? (source.evidence as Record<string, unknown>)
        : {},
    confidence: Number.isFinite(Number(source.confidence))
      ? Number(source.confidence)
      : 0,
    suggested_action: source.suggested_action,
  };
}

const CATEGORY_ORDER: Record<string, number> = {
  risk: 1,
  care: 2,
  opportunity: 3,
  community: 4,
  event: 5,
};

/**
 * Risk before care, care before opportunity, and within each, whichever the
 * café is most sure of. A member of staff has limited attention; spend it on
 * what could go wrong before what could go well.
 */
export function rankRecommendations(
  recommendations: Recommendation[],
): Recommendation[] {
  return [...recommendations].sort((left, right) => {
    const byCategory =
      (CATEGORY_ORDER[left.category] ?? 9) - (CATEGORY_ORDER[right.category] ?? 9);
    if (byCategory !== 0) return byCategory;

    if (left.priority !== right.priority) return left.priority - right.priority;

    return right.confidence - left.confidence;
  });
}

/**
 * How the CRM describes its own certainty. Deliberately blunt: "fairly sure"
 * invites disagreement in a way that "87%" does not.
 */
export function confidenceWording(confidence: number): string {
  if (confidence >= 0.9) return "Certain";
  if (confidence >= 0.75) return "Confident";
  if (confidence >= 0.6) return "Fairly sure";
  return "A hunch";
}

/**
 * Turns the evidence payload into readable lines, so staff can check the
 * reasoning without opening the database.
 */
export function describeEvidence(
  evidence: Record<string, unknown>,
): { label: string; value: string }[] {
  return Object.entries(evidence).flatMap(([key, value]) => {
    if (value === null || value === undefined || value === "") return [];

    return [
      {
        label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
        value: String(value),
      },
    ];
  });
}
