"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  parseArrivalContext,
  type ArrivalContext,
} from "@/lib/intelligence/arrival";
import {
  quickAddAndWelcome,
  searchGuests,
  welcomeGuest,
  type GuestMatch,
} from "./actions";

/**
 * The counter.
 *
 * Everything the barista does happens here, without a page navigation: type,
 * see matches appear, press Enter or tap once, read the card. The design
 * target is the whole interaction under five seconds with somebody waiting, so
 * every decision below trades a feature for a removed step or a removed thought.
 */
export function ArrivalCounter() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<GuestMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [welcomed, setWelcomed] = useState<ArrivalContext | null>(null);
  const [alreadyKnown, setAlreadyKnown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryId, setRetryId] = useState<string | null>(null);
  const [pending, startWelcome] = useTransition();

  const inputRef = useRef<HTMLInputElement>(null);
  const searchToken = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search is driven from the change handler rather than an effect, so a
  // keystroke schedules exactly one debounced query and state only changes in
  // response to an event. A café LAN is fast; 150ms avoids a query per
  // keystroke without the list lagging behind typing.
  const onQueryChange = (next: string) => {
    setQuery(next);

    const trimmed = next.trim();
    const token = ++searchToken.current;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (trimmed.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceTimer.current = setTimeout(async () => {
      const found = await searchGuests(trimmed);
      // Ignore a result that arrived after a newer keystroke.
      if (token === searchToken.current) {
        setMatches(found);
        setSearching(false);
      }
    }, 150);
  };

  const welcome = useCallback(
    (personId: string) => {
      setError(null);
      setRetryId(personId);
      startWelcome(async () => {
        const result = await welcomeGuest(personId);
        if (result.ok) {
          setWelcomed(parseArrivalContext(result.context));
          setAlreadyKnown(false);
          setRetryId(null);
          setQuery("");
          setMatches([]);
          // Refresh the server-rendered "In today" list beneath.
          router.refresh();
          inputRef.current?.focus();
        } else {
          setError(result.error);
        }
      });
    },
    [router],
  );

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      // Enter welcomes the top match. With one clear result this is the whole
      // interaction: type a name, press Enter, read the card. A barcode reader
      // ends its scan with Enter, so a scanned card resolves and welcomes in
      // the same motion.
      if (matches.length > 0) {
        welcome(matches[0].id);
      }
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800"
        >
          <p className="font-medium">{error}</p>
          {retryId && (
            <button
              onClick={() => welcome(retryId)}
              className="rounded-xl border border-red-400 px-4 py-2 text-sm"
            >
              Try again
            </button>
          )}
        </div>
      )}

      {welcomed && (
        <WelcomeCard
          context={welcomed}
          alreadyKnown={alreadyKnown}
          onDismiss={() => {
            setWelcomed(null);
            inputRef.current?.focus();
          }}
        />
      )}

      <section aria-label="Find a guest" className="rounded-2xl border p-5">
        <label htmlFor="arrival-search" className="text-lg font-semibold">
          Who just walked in?
        </label>
        <p className="mt-1 text-sm text-neutral-500">
          Type a name or number, or scan their card. Press Enter for the top
          match.
        </p>

        <input
          id="arrival-search"
          ref={inputRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Name, phone, or scan"
          autoFocus
          autoComplete="off"
          aria-label="Search for a guest by name or phone"
          className="mt-4 w-full rounded-xl border px-4 py-4 text-xl"
        />

        {query.trim().length >= 2 && (
          <ul className="mt-4 space-y-2" aria-live="polite">
            {matches.map((match, index) => (
              <li key={match.id}>
                <button
                  onClick={() => {
                    welcome(match.id);
                  }}
                  disabled={pending}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border p-4 text-left disabled:opacity-50"
                >
                  <span>
                    <span className="text-lg font-medium">{match.name}</span>
                    {match.subtitle && (
                      <span className="ml-2 text-sm text-neutral-500">
                        {match.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="rounded-lg bg-black px-4 py-2 text-white">
                    {index === 0 ? "They're here ⏎" : "They're here"}
                  </span>
                </button>
              </li>
            ))}

            {!searching && matches.length === 0 && (
              <li className="rounded-xl bg-neutral-50 p-4 text-neutral-600">
                Nobody found. Add them below — it takes two fields.
              </li>
            )}
          </ul>
        )}
      </section>

      <QuickAdd
        onWelcomed={(context, known) => {
          setWelcomed(context);
          setAlreadyKnown(known);
          router.refresh();
        }}
      />
    </div>
  );
}

function WelcomeCard({
  context,
  alreadyKnown,
  onDismiss,
}: {
  context: ArrivalContext;
  alreadyKnown: boolean;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-black p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm uppercase tracking-wide text-neutral-500">
          {alreadyKnown ? "Already known — welcomed" : "Welcomed"}
        </p>
        <button
          onClick={onDismiss}
          className="text-sm text-neutral-500 underline"
        >
          Next guest
        </button>
      </div>

      <h2 className="mt-1 text-3xl font-semibold">{context.greeting_name}</h2>

      {/* Safety is the one thing that must be impossible to miss. */}
      {context.allergies.length > 0 && (
        <p className="mt-4 rounded-xl bg-red-100 p-4 text-xl font-bold text-red-900">
          ⚠ Allergic to {context.allergies.join(", ")}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Fact label="Usual" value={context.usual_drink || "Not known yet — ask"} big />
        <Fact label="Often with" value={context.usual_food || "—"} />
        <Fact label="Seating" value={context.seating || "No preference recorded"} />
        <Fact
          label="Visits"
          value={
            context.is_first_visit
              ? "First time here"
              : `${context.total_visits} visits`
          }
        />
      </div>

      {context.next_best_action &&
        context.next_best_action.recommendation !== "none" && (
          <div className="mt-4 rounded-xl bg-neutral-900 p-4 text-white">
            <p className="text-sm uppercase tracking-wide text-neutral-400">
              {context.next_best_action.label}
            </p>
            <p className="mt-1 text-lg font-medium">
              {context.next_best_action.suggested_action}
            </p>
          </div>
        )}

      {context.communities.length > 0 && (
        <p className="mt-3 text-sm text-neutral-500">
          Part of {context.communities.join(", ")}
        </p>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  big = false,
}: {
  label: string;
  value: string;
  big?: boolean;
}) {
  return (
    <div className="rounded-xl bg-neutral-50 p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className={big ? "mt-1 text-2xl font-semibold" : "mt-1 text-lg font-medium"}>
        {value}
      </p>
    </div>
  );
}

function QuickAdd({
  onWelcomed,
}: {
  onWelcomed: (context: ArrivalContext, alreadyKnown: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section aria-label="Somebody new" className="rounded-2xl border p-5">
      <p className="text-lg font-semibold">Somebody new</p>
      <p className="mt-1 text-sm text-neutral-500">
        A name and one way to reach them. The rest can wait until there is a
        moment.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const result = await quickAddAndWelcome(formData);
            if (result.ok) {
              const context = parseArrivalContext(result.context);
              const known = Boolean(
                (result.context as { already_known?: boolean }).already_known,
              );
              if (context) onWelcomed(context, known);
            } else {
              setError(result.error);
            }
          });
        }}
        className="mt-4 grid gap-3 sm:grid-cols-2"
      >
        <input
          name="guest_name"
          required
          placeholder="Name"
          aria-label="Guest name"
          className="rounded-xl border px-4 py-3 sm:col-span-2"
        />
        <input
          name="phone"
          placeholder="Phone"
          aria-label="Phone number"
          className="rounded-xl border px-4 py-3"
        />
        <input
          name="email"
          type="email"
          placeholder="Email"
          aria-label="Email address"
          className="rounded-xl border px-4 py-3"
        />
        <button
          disabled={pending}
          className="rounded-xl bg-black px-6 py-3 text-white disabled:opacity-50 sm:col-span-2"
        >
          {pending ? "Adding..." : "Add and welcome"}
        </button>
      </form>
    </section>
  );
}
