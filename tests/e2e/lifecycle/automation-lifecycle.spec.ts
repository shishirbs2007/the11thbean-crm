import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();

let birthdayGuestId = "";
let automationId = "";

test.describe.serial("Automation engine", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    const { data: person, error: personError } = await admin
      .from("people")
      .insert({
        first_name: `AutoGuest${timestamp}`,
        last_name: "Birthday",
        email: `autoguest-${timestamp}@example.com`,
        person_type: "customer",
        is_active: true,
      })
      .select("id")
      .single();

    if (personError) throw personError;
    birthdayGuestId = person.id;

    const today = new Date();
    const { error: dateError } = await admin.from("important_dates").insert({
      person_id: birthdayGuestId,
      date_type: "birthday",
      date_value: `1992-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
        today.getDate(),
      ).padStart(2, "0")}`,
      recurring_annually: true,
    });

    if (dateError) throw dateError;

    const { data: automation } = await admin
      .from("hospitality_automations")
      .select("id")
      .eq("key", "birthday_greeting")
      .single();

    automationId = automation!.id;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    if (automationId) {
      await admin
        .from("hospitality_automations")
        .update({ is_active: false, last_run_at: null })
        .eq("id", automationId);

      const { data: runs } = await admin
        .from("automation_runs")
        .select("id")
        .eq("automation_id", automationId);

      for (const run of runs ?? []) {
        await admin.from("automation_run_items").delete().eq("run_id", run.id);
      }

      await admin.from("automation_runs").delete().eq("automation_id", automationId);
    }

    if (birthdayGuestId) {
      await admin.from("hospitality_tasks").delete().eq("person_id", birthdayGuestId);
      await admin.from("important_dates").delete().eq("person_id", birthdayGuestId);
      await admin.from("timeline_entries").delete().eq("person_id", birthdayGuestId);
      await admin
        .from("customer_health_history")
        .delete()
        .eq("person_id", birthdayGuestId);
      await admin.from("customer_health").delete().eq("person_id", birthdayGuestId);
      await admin.from("people").delete().eq("id", birthdayGuestId);
    }
  });

  test("ships every automation switched off", async ({ page }) => {
    await page.goto("/automations");

    const list = page.getByRole("region", { name: "Automations" });

    await expect(list.getByText("Birthday greeting")).toBeVisible();
    // Nothing acts on a café's guests until somebody deliberately enables it.
    await expect(
      list.getByRole("button", { name: "Turn on" }).first(),
    ).toBeVisible();
  });

  test("turning one on and running it raises a task with its reason", async ({
    page,
  }) => {
    await page.goto("/automations");

    const row = page
      .getByRole("region", { name: "Automations" })
      .getByRole("listitem")
      .filter({ hasText: "Birthday greeting" });

    await row.getByRole("button", { name: "Turn on" }).click();

    await page
      .getByRole("region", { name: "Automations" })
      .getByRole("listitem")
      .filter({ hasText: "Birthday greeting" })
      .getByRole("button", { name: "Run now" })
      .click();

    const history = page.getByRole("region", { name: "Execution history" });
    await expect(history.getByText(/succeeded · manual/)).toBeVisible();

    const admin = stagingAdminClient();
    const { data: tasks } = await admin
      .from("hospitality_tasks")
      .select("title, detail, source")
      .eq("person_id", birthdayGuestId);

    expect(tasks?.length).toBeGreaterThan(0);
    expect(tasks?.[0].detail).toContain("Birthday today");
    expect(tasks?.[0].source).toBe("system");
  });

  test("records who was acted on and why", async () => {
    const admin = stagingAdminClient();

    const { data: items } = await admin
      .from("automation_run_items")
      .select("outcome, reason, person_id")
      .eq("person_id", birthdayGuestId);

    expect(items?.length).toBeGreaterThan(0);
    expect(items?.[0].outcome).toBe("acted");
    expect(items?.[0].reason).toBe("Birthday today");
  });

  test("does not act twice for the same guest on the same day", async () => {
    const admin = stagingAdminClient();

    const { error } = await admin.rpc("run_automation", {
      target_automation_id: automationId,
      triggered_by: "manual",
    });

    if (error) throw error;

    const { data: items } = await admin
      .from("automation_run_items")
      .select("outcome")
      .eq("person_id", birthdayGuestId);

    // The second run finds them again and deliberately skips them.
    expect(items?.some((item) => item.outcome === "skipped")).toBe(true);

    const { data: tasks } = await admin
      .from("hospitality_tasks")
      .select("id")
      .eq("person_id", birthdayGuestId)
      .eq("task_type", "birthday_greeting");

    expect(tasks).toHaveLength(1);
  });

  test("refuses to run an automation that is switched off", async () => {
    const admin = stagingAdminClient();

    await admin
      .from("hospitality_automations")
      .update({ is_active: false })
      .eq("id", automationId);

    const { error } = await admin.rpc("run_automation", {
      target_automation_id: automationId,
      triggered_by: "manual",
    });

    expect(error?.message).toContain("switched off");
  });
});
