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

  test("typing a name shows matches without a page navigation", async ({
    page,
  }) => {
    await page.goto("/arrival");
    const before = page.url();

    await page
      .getByLabel("Search for a guest by name or phone")
      .fill(`Reg${timestamp}`);

    // Matches appear live; the URL never changed.
    await expect(
      page.getByRole("button", { name: new RegExp(`Reg${timestamp}`) }),
    ).toBeVisible();
    expect(page.url()).toBe(before);
  });

  test("tapping a match records the visit and shows what to say", async ({
    page,
  }) => {
    await page.goto("/arrival");

    await page
      .getByLabel("Search for a guest by name or phone")
      .fill(`Reg${timestamp}`);

    await page
      .getByRole("button", { name: new RegExp(`Reg${timestamp}`) })
      .click();

    await expect(page.getByText("Allergic to Shellfish")).toBeVisible();
    await expect(page.getByText("Cortado")).toBeVisible();
    await expect(page.getByText("First time here")).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id, source")
      .eq("person_id", regularId);

    expect(visits).toHaveLength(1);
    expect(visits?.[0].source).toBe("arrival");
  });

  test("pressing Enter welcomes the top match with no mouse", async ({
    page,
  }) => {
    await page.goto("/arrival");

    const search = page.getByLabel("Search for a guest by name or phone");
    await search.fill(`Reg${timestamp}`);
    await expect(
      page.getByRole("button", { name: new RegExp(`Reg${timestamp}`) }),
    ).toBeVisible();
    await search.press("Enter");

    await expect(page.getByText(/Allergic to Shellfish/)).toBeVisible();

    const admin = stagingAdminClient();
    const { data: visits } = await admin
      .from("visits")
      .select("id")
      .eq("person_id", regularId);

    // Still one: the double interaction within the hour is one visit.
    expect(visits).toHaveLength(1);
  });

  test("a scanned card (an id) resolves to that guest", async ({ page }) => {
    await page.goto("/arrival");

    // A keyboard-wedge scanner types the encoded id then Enter.
    const search = page.getByLabel("Search for a guest by name or phone");
    await search.fill(regularId);
    await expect(
      page.getByRole("button", { name: new RegExp(`Reg${timestamp}`) }),
    ).toBeVisible();
    await search.press("Enter");

    await expect(page.getByText(/Allergic to Shellfish/)).toBeVisible();
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
    await form.getByLabel("Guest name").fill(`Regular${timestamp} Guest`);
    await form.getByLabel("Phone number").fill(phone);
    await form.getByRole("button", { name: "Add and welcome" }).click();

    await expect(page.getByText("Already known — welcomed")).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin.from("people").select("id").eq("phone", phone);

    expect(data).toHaveLength(1);
  });

  test("refuses a new guest with no way to recognise them again", async ({
    page,
  }) => {
    await page.goto("/arrival");

    const form = page.getByRole("region", { name: "Somebody new" });
    await form.getByLabel("Guest name").fill(`Nameless${timestamp}`);
    await form.getByRole("button", { name: "Add and welcome" }).click();

    // The failure is shown inline; nothing is created.
    await expect(
      form.getByText(/phone number or email is needed/i),
    ).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin
      .from("people")
      .select("id")
      .eq("first_name", `Nameless${timestamp}`);

    expect(data).toHaveLength(0);
  });

  test("the shift list updates as guests arrive", async ({ page }) => {
    await page.goto("/arrival");

    const today = page.getByRole("region", { name: "In today" });

    await expect(
      today.getByRole("link", { name: new RegExp(`Reg${timestamp}`) }),
    ).toBeVisible();
    await expect(
      today.getByRole("link", { name: new RegExp(`Newcomer${timestamp}`) }),
    ).toBeVisible();
  });
});
