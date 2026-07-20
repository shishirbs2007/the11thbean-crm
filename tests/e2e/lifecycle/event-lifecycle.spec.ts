import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const communityName = `Badminton ${timestamp}`;
const eventName = `Doubles night ${timestamp}`;

let communityId = "";
let eventId = "";
let regularId = "";
let strangerId = "";

test.describe.serial("Event lifecycle", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    const { data: community, error: communityError } = await admin
      .from("communities")
      .insert({
        name: communityName,
        category: "sport",
        is_active: true,
      })
      .select("id")
      .single();

    if (communityError) throw communityError;
    communityId = community.id;

    const { data: people, error: peopleError } = await admin
      .from("people")
      .insert([
        {
          first_name: `Regular${timestamp}`,
          last_name: "Player",
          email: `regular-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
        {
          first_name: `Stranger${timestamp}`,
          last_name: "Passerby",
          email: `stranger-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
      ])
      .select("id");

    if (peopleError) throw peopleError;
    regularId = people[0].id;
    strangerId = people[1].id;

    // Only the regular belongs to the community hosting the event.
    const { error: membershipError } = await admin
      .from("community_memberships")
      .insert({
        community_id: communityId,
        person_id: regularId,
        role: "member",
        joined_at: new Date().toISOString().slice(0, 10),
      });

    if (membershipError) throw membershipError;

    const { data: event, error: eventError } = await admin
      .from("events")
      .insert({
        name: eventName,
        starts_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        location: "Court 2",
        capacity: 4,
        status: "published",
        event_type: "badminton",
        community_id: communityId,
      })
      .select("id")
      .single();

    if (eventError) throw eventError;
    eventId = event.id;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    if (eventId) {
      await admin.from("event_registrations").delete().eq("event_id", eventId);
      await admin.from("events").delete().eq("id", eventId);
    }

    for (const personId of [regularId, strangerId].filter(Boolean)) {
      await admin.from("timeline_entries").delete().eq("person_id", personId);
      await admin.from("customer_health_history").delete().eq("person_id", personId);
      await admin.from("customer_health").delete().eq("person_id", personId);
      await admin.from("community_memberships").delete().eq("person_id", personId);
      await admin.from("people").delete().eq("id", personId);
    }

    if (communityId) {
      await admin.from("communities").delete().eq("id", communityId);
    }
  });

  test("suggests the community member, not the stranger", async ({ page }) => {
    await page.goto(`/events/${eventId}`);

    const suggestions = page.getByRole("region", { name: "Who to invite" });

    await expect(suggestions.getByText(`Regular${timestamp}`)).toBeVisible();
    await expect(
      suggestions.getByText("Member of the hosting community"),
    ).toBeVisible();
    await expect(
      suggestions.getByText(`Stranger${timestamp}`),
    ).toHaveCount(0);
  });

  test("invites a suggested guest and moves them onto the guest list", async ({
    page,
  }) => {
    await page.goto(`/events/${eventId}`);

    const suggestions = page.getByRole("region", { name: "Who to invite" });
    await suggestions
      .getByRole("listitem")
      .filter({ hasText: `Regular${timestamp}` })
      .getByRole("button", { name: "Invite" })
      .click();

    const guestList = page.getByRole("region", { name: "Guest list" });
    await expect(guestList.getByText(`Regular${timestamp}`)).toBeVisible();

    // Once invited they are no longer a suggestion.
    await expect(
      page
        .getByRole("region", { name: "Who to invite" })
        .getByText(`Regular${timestamp}`),
    ).toHaveCount(0);
  });

  test("tracks capacity as guests register", async ({ page }) => {
    await page.goto(`/events/${eventId}`);

    await page
      .getByRole("region", { name: "Register someone" })
      .getByRole("combobox")
      .selectOption(strangerId);
    await page
      .getByRole("region", { name: "Register someone" })
      .getByPlaceholder("Guests")
      .fill("4");
    await page
      .getByRole("region", { name: "Register someone" })
      .getByRole("button", { name: "Register" })
      .click();

    // Four guests against a capacity of four leaves no places.
    await expect(page.getByText("Full · 0 left")).toBeVisible();
    await expect(page.getByText("4 of 4")).toBeVisible();
  });

  test("records attendance and writes it to the guest's timeline", async ({
    page,
  }) => {
    await page.goto(`/events/${eventId}`);

    await page
      .getByRole("region", { name: "Guest list" })
      .getByRole("listitem")
      .filter({ hasText: `Stranger${timestamp}` })
      .getByRole("button", { name: "Came" })
      .click();

    await expect(
      page
        .getByRole("region", { name: "Guest list" })
        .getByRole("listitem")
        .filter({ hasText: `Stranger${timestamp}` })
        .getByText(/attended/),
    ).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin
      .from("timeline_entries")
      .select("title, event_type")
      .eq("person_id", strangerId);

    expect(data?.some((entry) => entry.title === `Attended ${eventName}`)).toBe(
      true,
    );
  });

  test("suggests hospitality follow-ups once the event has passed", async ({
    page,
  }) => {
    await page.goto(`/events/${eventId}`);

    const followUps = page.getByRole("region", { name: "After the event" });

    await expect(followUps.getByText(/Thank Stranger/)).toBeVisible();
  });
});
