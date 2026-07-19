import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.",
  );
  process.exit(2);
}

const supabase = createClient(url, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const checks = [];

async function check(name, callback) {
  try {
    const result = await callback();

    if (result === true) {
      checks.push({ name, status: "PASS" });
      return;
    }

    checks.push({
      name,
      status: "FAIL",
      detail:
        typeof result === "string"
          ? result
          : JSON.stringify(result),
    });
  } catch (error) {
    checks.push({
      name,
      status: "FAIL",
      detail:
        error instanceof Error ? error.message : String(error),
    });
  }
}

await check("No duplicate customer emails", async () => {
  const { data, error } = await supabase
    .from("people")
    .select("email")
    .not("email", "is", null);

  if (error) throw error;

  const values = data.map((row) => row.email.toLowerCase());
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );

  return duplicates.length === 0
    ? true
    : `Duplicates: ${[...new Set(duplicates)].join(", ")}`;
});

await check("No duplicate customer phones", async () => {
  const { data, error } = await supabase
    .from("people")
    .select("phone")
    .not("phone", "is", null);

  if (error) throw error;

  const values = data.map((row) => row.phone);
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );

  return duplicates.length === 0
    ? true
    : `Duplicates: ${[...new Set(duplicates)].join(", ")}`;
});

await check("Visit amounts are non-negative", async () => {
  const { data, error } = await supabase
    .from("visits")
    .select("id,gross_amount,discount_amount,tax_amount,net_amount")
    .or(
      "gross_amount.lt.0,discount_amount.lt.0,tax_amount.lt.0,net_amount.lt.0",
    );

  if (error) throw error;

  return data.length === 0
    ? true
    : `${data.length} invalid visit rows`;
});

await check("Health scores stay between 0 and 100", async () => {
  const { data, error } = await supabase
    .from("customer_health")
    .select("person_id,health_score,churn_risk")
    .or(
      "health_score.lt.0,health_score.gt.100,churn_risk.lt.0,churn_risk.gt.100",
    );

  if (error) throw error;

  return data.length === 0
    ? true
    : `${data.length} invalid health rows`;
});

await check("Loyalty balances are non-negative", async () => {
  const { data, error } = await supabase
    .from("loyalty_accounts")
    .select("person_id,points_balance,wallet_balance")
    .or("points_balance.lt.0,wallet_balance.lt.0");

  if (error) throw error;

  return data.length === 0
    ? true
    : `${data.length} negative loyalty balances`;
});

await check("Gift-card balances are valid", async () => {
  const { data, error } = await supabase
    .from("gift_cards")
    .select("id,original_value,remaining_value");

  if (error) throw error;

  const invalid = data.filter(
    (row) =>
      Number(row.remaining_value) < 0 ||
      Number(row.remaining_value) > Number(row.original_value),
  );

  return invalid.length === 0
    ? true
    : `${invalid.length} invalid gift cards`;
});

await check("Household primary contacts are members", async () => {
  const { data: households, error } = await supabase
    .from("households")
    .select("id,primary_contact_id")
    .not("primary_contact_id", "is", null);

  if (error) throw error;

  for (const household of households) {
    const { count, error: memberError } = await supabase
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", household.id)
      .eq("person_id", household.primary_contact_id);

    if (memberError) throw memberError;

    if (!count) {
      return `Household ${household.id} has a non-member primary contact`;
    }
  }

  return true;
});

await check("Visit item totals match quantity × price", async () => {
  const { data, error } = await supabase
    .from("visit_items")
    .select("id,quantity,unit_price,total_amount");

  if (error) throw error;

  const invalid = data.filter((row) => {
    const expected =
      Number(row.quantity) * Number(row.unit_price);
    return Math.abs(expected - Number(row.total_amount)) > 0.01;
  });

  return invalid.length === 0
    ? true
    : `${invalid.length} invalid visit-item totals`;
});

await check("All active staff roles are valid", async () => {
  const { data, error } = await supabase
    .from("app_roles")
    .select("user_id,role")
    .eq("is_active", true);

  if (error) throw error;

  const allowed = new Set(["barista", "manager", "admin"]);
  const invalid = data.filter((row) => !allowed.has(row.role));

  return invalid.length === 0
    ? true
    : `${invalid.length} invalid staff roles`;
});

const width = Math.max(...checks.map((item) => item.name.length), 20);

console.log("");
console.log("DATABASE INTEGRITY");
console.log("=".repeat(width + 16));

for (const item of checks) {
  console.log(
    `${item.name.padEnd(width)}  ${item.status.padEnd(5)}  ${
      item.detail || ""
    }`,
  );
}

const failures = checks.filter((item) => item.status === "FAIL");

console.log("");
console.log(
  `${checks.length} checks, ${checks.length - failures.length} passed, ${failures.length} failed`,
);

if (failures.length) {
  process.exit(1);
}
