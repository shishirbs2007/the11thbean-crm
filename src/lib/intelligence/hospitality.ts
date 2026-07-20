/**
 * Hospitality intelligence.
 *
 * Turns what the CRM already knows about a guest into things a member of staff
 * can act on the moment that guest walks in. Everything here is derived: the
 * café should never have to type in what its own records already show.
 */

export type OrderedItem = {
  item_name: string;
  category: string | null;
  visit_count: number;
  total_quantity: number;
  last_ordered_at: string | null;
};

export type TasteProfile = {
  drink: OrderedItem[];
  food: OrderedItem[];
  other: OrderedItem[];
};

export type HospitalitySignals = {
  /** Drinks and food inferred from recorded order history. */
  taste: TasteProfile;
  /** Anything the guest has told staff directly, which always wins. */
  statedDrink: string;
  allergies: string[];
  seatingPreference: string;
  daysSinceLastVisit: number | null;
  referralCount: number;
  communityNames: string[];
  upcomingDates: { label: string; daysAway: number }[];
};

const EMPTY_TASTE: TasteProfile = {
  drink: [],
  food: [],
  other: [],
};

/**
 * Normalises the jsonb payload from `customer_taste_profile` into a shape the
 * UI can rely on, tolerating missing or malformed keys.
 */
export function parseTasteProfile(value: unknown): TasteProfile {
  if (!value || typeof value !== "object") return EMPTY_TASTE;

  const source = value as Record<string, unknown>;

  const read = (key: string): OrderedItem[] => {
    const entries = source[key];
    if (!Array.isArray(entries)) return [];

    return entries.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      if (typeof item.item_name !== "string" || !item.item_name) return [];

      return [
        {
          item_name: item.item_name,
          category: typeof item.category === "string" ? item.category : null,
          visit_count: Number(item.visit_count ?? 0),
          total_quantity: Number(item.total_quantity ?? 0),
          last_ordered_at:
            typeof item.last_ordered_at === "string"
              ? item.last_ordered_at
              : null,
        },
      ];
    });
  };

  return {
    drink: read("drink"),
    food: read("food"),
    other: read("other"),
  };
}

export type ImportantDateRow = {
  date_type: string;
  date_value: string;
  label: string | null;
  recurring_annually: boolean;
};

const UPCOMING_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The dates worth mentioning in the next fortnight. Annually recurring dates
 * roll forward to their next occurrence so a birthday recorded in 2019 still
 * surfaces this year.
 */
export function upcomingImportantDates(
  rows: ImportantDateRow[],
  today: Date = new Date(),
): { label: string; daysAway: number }[] {
  const startOfToday = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );

  return rows
    .flatMap((row) => {
      const parsed = new Date(`${row.date_value}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) return [];

      let occurrence = Date.UTC(
        row.recurring_annually
          ? today.getUTCFullYear()
          : parsed.getUTCFullYear(),
        parsed.getUTCMonth(),
        parsed.getUTCDate(),
      );

      if (row.recurring_annually && occurrence < startOfToday) {
        occurrence = Date.UTC(
          today.getUTCFullYear() + 1,
          parsed.getUTCMonth(),
          parsed.getUTCDate(),
        );
      }

      const daysAway = Math.round((occurrence - startOfToday) / MS_PER_DAY);
      if (daysAway < 0 || daysAway > UPCOMING_WINDOW_DAYS) return [];

      return [
        {
          label: row.label || row.date_type,
          daysAway,
        },
      ];
    })
    .sort((left, right) => left.daysAway - right.daysAway);
}

/**
 * The guest's usual drink. A drink they have actually ordered more than once
 * beats one noted by staff, because the till does not misremember.
 */
export function usualDrink(signals: HospitalitySignals): string {
  const inferred = signals.taste.drink[0];

  if (inferred && inferred.visit_count > 1) return inferred.item_name;
  if (signals.statedDrink) return signals.statedDrink;
  return inferred?.item_name ?? "";
}

/** The guest's usual food order, if the history shows a clear repeat. */
export function usualFood(signals: HospitalitySignals): string {
  const inferred = signals.taste.food[0];
  return inferred && inferred.visit_count > 1 ? inferred.item_name : "";
}

/**
 * Builds the short list of things worth doing for this guest today, most
 * important first. Safety comes before warmth; warmth before commerce.
 */
export function buildHospitalitySuggestions(
  signals: HospitalitySignals,
  limit = 5,
): string[] {
  const suggestions: string[] = [];

  if (signals.allergies.length > 0) {
    suggestions.push(
      `Check allergens before serving: ${signals.allergies.join(", ")}.`,
    );
  }

  for (const date of signals.upcomingDates) {
    suggestions.push(
      date.daysAway === 0
        ? `Today is their ${date.label}. Mark it warmly.`
        : `Their ${date.label} is in ${date.daysAway} day${
            date.daysAway === 1 ? "" : "s"
          }. Plan something small.`,
    );
  }

  const drink = usualDrink(signals);
  suggestions.push(
    drink
      ? `Offer their usual ${drink} or a thoughtful variation.`
      : "Ask what coffee style they usually enjoy, and record it.",
  );

  const food = usualFood(signals);
  if (food) {
    suggestions.push(`They often pair it with ${food}.`);
  }

  if (signals.seatingPreference) {
    suggestions.push(`Seat them ${signals.seatingPreference}.`);
  }

  if (signals.daysSinceLastVisit !== null && signals.daysSinceLastVisit >= 45) {
    suggestions.push(
      `Reconnect personally. Their last recorded visit was ${signals.daysSinceLastVisit} days ago.`,
    );
  }

  if (signals.referralCount > 0) {
    suggestions.push(
      `Thank them for introducing ${signals.referralCount} customer${
        signals.referralCount === 1 ? "" : "s"
      }.`,
    );
  }

  if (signals.communityNames.length > 0) {
    suggestions.push(
      `Ask how ${signals.communityNames[0]} is going. They are a regular there.`,
    );
  }

  return suggestions.slice(0, limit);
}
