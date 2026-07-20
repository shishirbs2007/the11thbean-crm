import { expect, test } from "@playwright/test";

import { stagingAdminClient } from "../support/environment";

const timestamp = Date.now();
const audienceName = `Lapsed regulars ${timestamp}`;
const campaignName = `Come back for the new roast ${timestamp}`;

let consentingId = "";
let refusingId = "";
let audienceId = "";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

test.describe.serial("Campaign lifecycle", () => {
  test.beforeAll(async () => {
    const admin = stagingAdminClient();

    const { data: people, error: peopleError } = await admin
      .from("people")
      .insert([
        {
          first_name: `Consenting${timestamp}`,
          last_name: "Regular",
          email: `consenting-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
        {
          first_name: `Refusing${timestamp}`,
          last_name: "Regular",
          email: `refusing-${timestamp}@example.com`,
          person_type: "customer",
          is_active: true,
        },
      ])
      .select("id");

    if (peopleError) throw peopleError;
    consentingId = people[0].id;
    refusingId = people[1].id;

    // Both are lapsed regulars: three visits, none recent.
    const { error: visitError } = await admin.from("visits").insert(
      [consentingId, refusingId].flatMap((personId) =>
        [120, 100, 80].map((daysAgo) => ({
          person_id: personId,
          visited_at: isoDaysAgo(daysAgo),
          visit_type: "walk_in",
          party_size: 1,
          net_amount: 250,
          source: "manual",
        })),
      ),
    );

    if (visitError) throw visitError;

    // One has opted in to marketing, the other has explicitly refused.
    const { error: consentError } = await admin.from("consents").insert([
      {
        person_id: consentingId,
        purpose: "marketing",
        channel: "email",
        granted: true,
        source: "regression",
      },
      {
        person_id: refusingId,
        purpose: "marketing",
        channel: "email",
        granted: false,
        source: "regression",
      },
    ]);

    if (consentError) throw consentError;
  });

  test.afterAll(async () => {
    const admin = stagingAdminClient();

    await admin
      .from("communication_campaigns")
      .delete()
      .eq("name", campaignName);

    if (audienceId) {
      await admin.from("audiences").delete().eq("id", audienceId);
    } else {
      await admin.from("audiences").delete().eq("name", audienceName);
    }

    for (const personId of [consentingId, refusingId].filter(Boolean)) {
      await admin.from("consents").delete().eq("person_id", personId);
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

  test("builds an audience that explains who it selected", async ({ page }) => {
    await page.goto("/audiences");

    const builder = page.getByRole("region", { name: "Build an audience" });

    await builder.getByPlaceholder("Audience name").fill(audienceName);
    await builder.getByRole("checkbox", { name: "Regulars not seen recently" }).check();
    await builder.getByRole("button", { name: "Create audience" }).click();

    const saved = page.getByRole("region", { name: "Saved audiences" });
    const row = saved.getByRole("listitem").filter({ hasText: audienceName });

    await expect(row).toBeVisible();
    // The audience accounts for itself rather than showing a bare number.
    await expect(row.getByText(/regulars not seen recently/i)).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin
      .from("audiences")
      .select("id")
      .eq("name", audienceName)
      .single();
    audienceId = data?.id ?? "";
  });

  test("excludes a guest who refused marketing consent", async () => {
    const admin = stagingAdminClient();

    const { data: audience } = await admin
      .from("audiences")
      .select("rules, match_mode, channel, purpose")
      .eq("name", audienceName)
      .single();

    const { data: members, error } = await admin.rpc("evaluate_audience", {
      audience_rules_json: audience!.rules,
      match_mode: audience!.match_mode,
      target_channel: audience!.channel,
      target_purpose: audience!.purpose,
    });

    if (error) throw error;

    const ids = (members ?? []).map(
      (member: { person_id: string }) => member.person_id,
    );

    expect(ids).toContain(consentingId);
    expect(ids).not.toContain(refusingId);
  });

  test("refuses to review a campaign with no reasoning", async ({ page }) => {
    await page.goto("/campaigns");

    const create = page.getByRole("region", { name: "Start a campaign" });
    await create.getByPlaceholder("Campaign name").fill(campaignName);
    await create.getByRole("button", { name: "Create draft" }).click();

    const campaign = page.getByRole("region", { name: campaignName });

    await expect(campaign.getByText("Why these guests?")).toBeVisible();
    await expect(campaign.getByText("What outcome do we hope for?")).toBeVisible();
  });

  test("walks the lifecycle once the reasoning is written down", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    const campaign = page.getByRole("region", { name: campaignName });

    await campaign
      .getByRole("combobox")
      .selectOption({ label: audienceName });
    await campaign
      .getByPlaceholder("Why these guests?")
      .fill("They were regulars and have not been in for months.");
    await campaign
      .getByPlaceholder("Why now?")
      .fill("The new roast lands this week.");
    await campaign
      .getByPlaceholder("Why this message?")
      .fill("It is the thing they used to order.");
    await campaign
      .getByPlaceholder("What outcome do we hope for?")
      .fill("A handful of them come back in and taste it.");
    await campaign.getByRole("button", { name: "Save reasoning" }).click();

    const ready = page.getByRole("region", { name: campaignName });
    await expect(ready.getByText(/^Ready\./)).toBeVisible();

    await ready.getByRole("button", { name: "Send for review" }).click();
    await expect(
      page.getByRole("region", { name: campaignName }).getByText(/review/),
    ).toBeVisible();

    await page
      .getByRole("region", { name: campaignName })
      .getByRole("button", { name: "Approve" })
      .click();

    // Wait for the approval to land before reading it back.
    await expect(
      page
        .getByRole("region", { name: campaignName })
        .getByRole("button", { name: "Schedule" }),
    ).toBeVisible();

    const admin = stagingAdminClient();
    const { data } = await admin
      .from("communication_campaigns")
      .select("status, approved_at, audience_snapshot")
      .eq("name", campaignName)
      .single();

    expect(data?.status).toBe("approved");
    expect(data?.approved_at).not.toBeNull();
    // The audience is captured at approval so results measure who was chosen.
    expect(data?.audience_snapshot).toHaveProperty("total");
  });

  test("writes an outbound message onto the guest's timeline", async () => {
    const admin = stagingAdminClient();

    const { data: campaign } = await admin
      .from("communication_campaigns")
      .select("id")
      .eq("name", campaignName)
      .single();

    const { error } = await admin.from("communication_messages").insert({
      person_id: consentingId,
      campaign_id: campaign!.id,
      channel: "email",
      direction: "outbound",
      subject: `New roast ${timestamp}`,
      body_text: "We saved you a cup.",
    });

    if (error) throw error;

    const { data: timeline } = await admin
      .from("timeline_entries")
      .select("title, event_type")
      .eq("person_id", consentingId)
      .eq("event_type", "communication");

    expect(timeline?.length).toBeGreaterThan(0);
    expect(timeline?.[0].title).toContain(campaignName);
  });
});
