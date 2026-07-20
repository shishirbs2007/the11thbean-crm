import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();

let birthdayPersonId = "";
let upsetPersonId = "";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

test.describe.serial("Daily briefing", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    const { data: people, error: peopleError } = await admin
      .from("people")
      .insert([
        {
          first_name: `Birthday${timestamp}`,
          last_name: "Guest",
          email: `birthday-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
        {
          first_name: `Upset${timestamp}`,
          last_name: "Guest",
          email: `upset-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
      ])
      .select("id");

    if (peopleError) throw peopleError;
    birthdayPersonId = people[0].id;
    upsetPersonId = people[1].id;

    // A birthday recorded years ago should still surface today.
    const today = new Date();
    const { error: dateError } = await admin.from("important_dates").insert({
      person_id: birthdayPersonId,
      date_type: "birthday",
      date_value: `1990-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate(),
      ).padStart(2, "0")}`,
      recurring_annually: true,
    });

    if (dateError) throw dateError;

    // Something the café got wrong and has not yet put right.
    const { error: feedbackError } = await admin
      .from("customer_feedback")
      .insert({
        person_id: upsetPersonId,
        rating: 2,
        feedback_type: "service",
        message: `Waited far too long for a coffee ${timestamp}`,
        resolution_status: "open",
      });

    if (feedbackError) throw feedbackError;

    // A guest with a weekly rhythm, so the briefing can expect them.
    const { error: visitError } = await admin.from("visits").insert(
      [21, 14, 7].map((daysAgo) => ({
        person_id: birthdayPersonId,
        visited_at: isoDaysAgo(daysAgo),
        visit_type: "walk_in",
        party_size: 1,
        net_amount: 300,
        source: "manual",
      })),
    );

    if (visitError) throw visitError;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    for (const personId of [birthdayPersonId, upsetPersonId].filter(Boolean)) {
      await admin.from("hospitality_tasks").delete().eq("person_id", personId);
      await admin.from("customer_feedback").delete().eq("person_id", personId);
      await admin.from("important_dates").delete().eq("person_id", personId);
      await admin.from("timeline_entries").delete().eq("person_id", personId);
      await admin.from("visits").delete().eq("person_id", personId);
      await admin
        .from("customer_health_history")
        .delete()
        .eq("person_id", personId);
      await admin.from("customer_health").delete().eq("person_id", personId);
      await admin.from("people").delete().eq("id", personId);
    }
  });

  test("raises a milestone task for today's birthday", async ({ page }) => {
    await page.goto("/briefing");

    const urgent = page.getByRole("region", { name: "Needs attention now" });

    await expect(
      urgent.getByText(`Wish Birthday${timestamp} a happy birthday`),
    ).toBeVisible();
    await expect(urgent.getByText("Milestone today").first()).toBeVisible();
  });

  test("raises service recovery for unresolved poor feedback", async ({
    page,
  }) => {
    await page.goto("/briefing");

    const urgent = page.getByRole("region", { name: "Needs attention now" });

    await expect(
      urgent.getByText(new RegExp(`Put things right with Upset${timestamp}`)),
    ).toBeVisible();
  });

  test("does not duplicate tasks when the briefing is reloaded", async ({
    page,
  }) => {
    await page.goto("/briefing");
    await page.goto("/briefing");

    const admin = stagingAdminClient();
    const { data } = await admin
      .from("hospitality_tasks")
      .select("id")
      .eq("person_id", birthdayPersonId)
      .eq("task_type", "milestone");

    expect(data).toHaveLength(1);
  });

  test("completing a task takes it off the day's list", async ({ page }) => {
    await page.goto("/briefing");

    await page
      .getByRole("region", { name: "Needs attention now" })
      .getByRole("listitem")
      .filter({ hasText: `Birthday${timestamp}` })
      .getByRole("button", { name: "Done" })
      .click();

    await expect(
      page
        .getByRole("region", { name: "Needs attention now" })
        .getByText(`Wish Birthday${timestamp} a happy birthday`),
    ).toHaveCount(0);
  });

  test("records a shift handover for the next shift to read", async ({
    page,
  }) => {
    await page.goto("/briefing");

    const handover = page.getByRole("region", { name: "Shift handover" });

    await handover
      .getByPlaceholder("How the shift went, what to look out for")
      .fill(`Quiet morning, machine serviced ${timestamp}`);
    await handover
      .getByPlaceholder("Guests worth a personal word")
      .fill(`Birthday${timestamp}`);
    await handover.getByRole("button", { name: "Save handover" }).click();

    await expect(
      page
        .getByRole("region", { name: "Shift handover" })
        .getByText(new RegExp(`machine serviced ${timestamp}`)),
    ).toBeVisible();
  });

  test("lets staff add their own task for the shift", async ({ page }) => {
    await page.goto("/briefing");

    const form = page.getByRole("region", { name: "Add a task" });

    await form
      .getByPlaceholder("What needs doing")
      .fill(`Order more oat milk ${timestamp}`);
    await form.getByRole("button", { name: "Add task" }).click();

    await expect(
      page.getByText(new RegExp(`Order more oat milk ${timestamp}`)),
    ).toBeVisible();
  });
});
