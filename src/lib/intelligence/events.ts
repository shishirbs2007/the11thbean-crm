/**
 * Event and community intelligence.
 *
 * Turns registration and attendance records into the judgements a host makes
 * in their head: is this event filling up, who is missing, who should we ask.
 */

export type AttendanceSummary = {
  registered_count: number;
  expected_headcount: number;
  attended_count: number;
  no_show_count: number;
  interested_count: number;
  capacity_used_percent: number | null;
};

export type CapacityState = "open" | "filling" | "nearly_full" | "full" | "over";

/**
 * How full the room will be. Deliberately conservative: a café that feels
 * crowded stops feeling like a café, so "nearly full" starts at 80%.
 */
export function capacityState(
  expectedHeadcount: number,
  capacity: number | null,
): CapacityState {
  if (!capacity || capacity <= 0) return "open";

  const used = (expectedHeadcount / capacity) * 100;

  if (used > 100) return "over";
  if (used === 100) return "full";
  if (used >= 80) return "nearly_full";
  if (used >= 50) return "filling";
  return "open";
}

export function capacityLabel(state: CapacityState): string {
  switch (state) {
    case "over":
      return "Over capacity";
    case "full":
      return "Full";
    case "nearly_full":
      return "Nearly full";
    case "filling":
      return "Filling up";
    default:
      return "Room to spare";
  }
}

/**
 * The number of places still available, or null when an event has no cap.
 * Never negative: an over-subscribed event has no places left, it has a
 * problem to talk to the host about.
 */
export function placesRemaining(
  expectedHeadcount: number,
  capacity: number | null,
): number | null {
  if (!capacity || capacity <= 0) return null;
  return Math.max(0, capacity - expectedHeadcount);
}

/**
 * The share of registered guests who actually turned up. Returns null until
 * the event has been marked off, so an unregistered event does not look like
 * a failure.
 */
export function attendanceRate(summary: AttendanceSummary): number | null {
  const decided = summary.attended_count + summary.no_show_count;
  if (decided === 0) return null;
  return Math.round((summary.attended_count / decided) * 100);
}

export type FollowUpCandidate = {
  personId: string;
  name: string;
  status: string;
};

/**
 * Who deserves a word after the event. Attendees get thanked, no-shows get
 * checked on gently rather than chased, and people who said they were
 * interested but never registered get a nudge.
 */
export function postEventActions(
  candidates: FollowUpCandidate[],
): { personId: string; name: string; action: string }[] {
  return candidates.flatMap((candidate) => {
    switch (candidate.status) {
      case "attended":
        return [
          {
            personId: candidate.personId,
            name: candidate.name,
            action: `Thank ${candidate.name} for coming and note anything they mentioned.`,
          },
        ];
      case "no_show":
        return [
          {
            personId: candidate.personId,
            name: candidate.name,
            action: `${candidate.name} registered but did not come. Check in warmly, do not chase.`,
          },
        ];
      case "interested":
        return [
          {
            personId: candidate.personId,
            name: candidate.name,
            action: `${candidate.name} was interested but never registered. Ask what would have made it easier.`,
          },
        ];
      default:
        return [];
    }
  });
}

export type CommunityHealthRow = {
  active_members: number;
  joined_last_quarter: number;
  events_last_quarter: number;
  last_event_at: string | null;
  next_event_at: string | null;
};

/**
 * A one-line read on whether a community is thriving, so staff see the
 * problem before the group quietly stops coming.
 */
export function communityStatus(row: CommunityHealthRow): {
  label: string;
  needsAttention: boolean;
} {
  if (row.active_members === 0) {
    return { label: "No active members", needsAttention: true };
  }

  if (row.events_last_quarter === 0) {
    return {
      label: row.last_event_at
        ? "No events this quarter"
        : "Never met yet",
      needsAttention: true,
    };
  }

  if (!row.next_event_at) {
    return { label: "Nothing planned next", needsAttention: true };
  }

  if (row.joined_last_quarter > 0) {
    return {
      label: `Growing, ${row.joined_last_quarter} joined recently`,
      needsAttention: false,
    };
  }

  return { label: "Meeting regularly", needsAttention: false };
}
