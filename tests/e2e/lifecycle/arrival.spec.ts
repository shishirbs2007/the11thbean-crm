import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const phone = `+9197${String(timestamp).slice(-8)}`;
const newPhone = `+9196${String(timestamp).slice(-8)}`;

let regularId = "";

test.describe.serial("Arrival", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    await admin.from("people").delete().in("phone", [phone, newPhone]);

    const { data, error } = await admin
      .from("people")
      .insert({
        first_name: `Regular${timestamp}`,
        last_name: "Guest",
        preferred_name: `Reg${timestamp}`,
        email: `arrival-${timestamp}@example.com`,
        phone,
        person_type: "customer",
        is_active: true,
      })
      .select("id")
      .single();

    if (error) throw error;
    regularId = data.id;

    // A known allergy and a usual, so the counter card has something to show.
    const { error: profileError } = await admin
      .from("customer_hospitality_profiles")
      .upsert({
        person_id: regularId,
        staff_summary: "Comes in after the school run.",
        coffee_preferences: { drink: "Cortado" },
        allergies: ["Shellfish"],
      });

    if (profileError) throw profileError;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    for (const p of [phone, newPhone]) {
      const { data: people } = await admin
        .from("people")
        .select("id")
        .eq("phone", p);

      for (const person of people ?? []) {
        await admin.from("visits").delete().eq("person_id", person.id);
        await admin.from("timeline_entries").delete().eq("person_id", person.id);
        await admin
          .from("customer_hospitality_profiles")
          .delete()
          .eq("person_id", person.id);
        await admin.from("hospitality_tasks").delete().eq("person_id", person.id);
        await admin
          .from("customer_health_history")
          .delete()
          .eq("person_id", person.id);
        await admin.from("customer_health").delete().eq("person_id", person.id);
        await admin.from("people").delete().eq("id", person.id);
      }
    }
  });

  test("one tap records the visit and shows what to say", async ({ page }) => {
    await page.goto(`/arrival?q=Regular${timestamp}`);

    await page
      .getByRole("region", { name: "Find a guest" })
      .getByRole("listitem")
      .filter({ hasText: `Reg${timestamp}` })
      .getByRole("button", { name: /here/i })
      .click();

    // The allergy must be impossible to miss.
    await expect(page.getByText("Allergic to Shellfish")).toBeVisible();
    await expect(page.getByText("Cortado")).toBeVisible();
    await expect(page.getByText("First time here")).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id, source, party_size")
      .eq("person_id", regularId);

    expect(visits).toHaveLength(1);
    expect(visits?.[0].source).toBe("arrival");
  });

  test("a second tap within the hour does not invent a second visit", async ({
    page,
  }) => {
    await page.goto(`/arrival?q=Regular${timestamp}`);

    await page
      .getByRole("region", { name: "Find a guest" })
      .getByRole("listitem")
      .filter({ hasText: `Reg${timestamp}` })
      .getByRole("button", { name: /here/i })
      .click();

    await expect(page.getByText(/Allergic to Shellfish/)).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("person_id", regularId);

    // Staff will double-tap. The café should absorb that, not record a fiction.
    expect(visits).toHaveLength(1);
  });

  test("adds somebody new from a name and a phone", async ({ page }) => {
    await page.goto("/arrival");

    const form = page.getByRole("region", { name: "Somebody new" });

    await form.getByLabel("Guest name").fill(`Newcomer${timestamp} Patel`);
    await form.getByLabel("Phone number").fill(newPhone);
    await form.getByRole("button", { name: "Add and welcome" }).click();

    await expect(
      page.getByRole("heading", { name: `Newcomer${timestamp}` }),
    ).toBeVisible();
    await expect(page.getByText("First time here")).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin
      .from("people")
      .select("id, first_name, last_name")
      .eq("phone", newPhone)
      .single();

    expect(data?.first_name).toBe(`Newcomer${timestamp}`);
    expect(data?.last_name).toBe("Patel");
  });

  test("recognises a returning guest instead of duplicating them", async ({
    page,
  }) => {
    await page.goto("/arrival");

    const form = page.getByRole("region", { name: "Somebody new" });

    // Same number, entered again by a busy counter.
    await form.getByLabel("Guest name").fill(`Regular${timestamp} Guest`);
    await form.getByLabel("Phone number").fill(phone);
    await form.getByRole("button", { name: "Add and welcome" }).click();

    await expect(page.getByText("Already known — welcomed")).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin.from("people").select("id").eq("phone", phone);

    expect(data).toHaveLength(1);
  });

  test("shows everyone recorded this shift", async ({ page }) => {
    await page.goto("/arrival");

    const today = page.getByRole("region", { name: "In today" });

    await expect(
      today.getByRole("link", { name: new RegExp(`Reg${timestamp}`) }),
    ).toBeVisible();
    await expect(
      today.getByRole("link", { name: new RegExp(`Newcomer${timestamp}`) }),
    ).toBeVisible();
  });

  test("refuses a new guest with no way to recognise them again", async ({
    page,
  }) => {
    await page.goto("/arrival");

    const form = page.getByRole("region", { name: "Somebody new" });
    await form.getByLabel("Guest name").fill(`Nameless${timestamp}`);
    await form.getByRole("button", { name: "Add and welcome" }).click();

    // Without a phone or email the café could never match their next order.
    const admin = stagingAdminClient();
    const { data } = await admin
      .from("people")
      .select("id")
      .eq("first_name", `Nameless${timestamp}`);

    expect(data).toHaveLength(0);
  });
});
