"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

function text(formData: FormData, name: string): string {
  return String(formData.get(name) || "").trim();
}

function numberValue(
  formData: FormData,
  name: string,
  fallback = 0,
): number {
  const parsed = Number(text(formData, name));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(
  formData: FormData,
  name: string,
): number | null {
  const raw = text(formData, name);
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function visitPath(
  id: string,
  type: "success" | "error",
  message: string,
): string {
  return `/visits/${id}?${type}=${encodeURIComponent(message)}`;
}

function redirectError(id: string, message: string): never {
  redirect(visitPath(id, "error", message));
}

function revalidateVisit(id?: string, personId?: string | null) {
  revalidatePath("/visits");
  revalidatePath("/dashboard");

  if (id) revalidatePath(`/visits/${id}`);
  if (personId) revalidatePath(`/customers/${personId}`);
}

export async function createVisit(formData: FormData) {
  const { supabase, user } = await requireUser();

  const personId = text(formData, "person_id");
  const visitedAt =
    text(formData, "visited_at") || new Date().toISOString();

  const grossAmount = numberValue(formData, "gross_amount");
  const discountAmount = numberValue(formData, "discount_amount");
  const taxAmount = numberValue(formData, "tax_amount");
  const enteredNet = text(formData, "net_amount");
  const calculatedNet = Math.max(
    0,
    grossAmount - discountAmount + taxAmount,
  );
  const netAmount = enteredNet
    ? numberValue(formData, "net_amount")
    : calculatedNet;

  const { count: existingVisits, error: countError } = personId
    ? await supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("person_id", personId)
    : { count: 0, error: null };

  if (countError) {
    redirect(`/visits?error=${encodeURIComponent(countError.message)}`);
  }

  const { data, error } = await supabase
    .from("visits")
    .insert({
      person_id: personId || null,
      visited_at: new Date(visitedAt).toISOString(),
      visit_type: text(formData, "visit_type") || "walk_in",
      party_size: Math.max(1, numberValue(formData, "party_size", 1)),
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      net_amount: netAmount,
      payment_method: text(formData, "payment_method") || null,
      order_reference: text(formData, "order_reference") || null,
      source: text(formData, "source") || "manual",
      visit_context: text(formData, "visit_context") || null,
      seating_area: text(formData, "seating_area") || null,
      table_reference: text(formData, "table_reference") || null,
      staff_notes: text(formData, "staff_notes") || null,
      customer_mood: text(formData, "customer_mood") || null,
      satisfaction_score: optionalNumber(
        formData,
        "satisfaction_score",
      ),
      is_first_visit: personId ? (existingVisits ?? 0) === 0 : false,
      created_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/visits?error=${encodeURIComponent(error.message)}`);
  }

  if (personId) {
    const customerName = text(formData, "customer_name") || "Customer";

    const { error: timelineError } = await supabase
      .from("timeline_entries")
      .insert({
        person_id: personId,
        event_type: "visit",
        title: `${customerName} visited the café`,
        summary:
          text(formData, "visit_context") ||
          `Recorded spend: ₹${netAmount.toFixed(0)}`,
        occurred_at: new Date(visitedAt).toISOString(),
        source_type: "visit",
        source_id: data.id,
        visibility: "barista",
        created_by: user.id,
      });

    if (timelineError) {
      redirect(visitPath(data.id, "error", timelineError.message));
    }
  }

  revalidateVisit(data.id, personId || null);
  redirect(visitPath(data.id, "success", "Visit recorded"));
}

export async function updateVisit(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const personId = text(formData, "person_id");
  const visitedAt = text(formData, "visited_at");

  const grossAmount = numberValue(formData, "gross_amount");
  const discountAmount = numberValue(formData, "discount_amount");
  const taxAmount = numberValue(formData, "tax_amount");
  const enteredNet = text(formData, "net_amount");
  const calculatedNet = Math.max(
    0,
    grossAmount - discountAmount + taxAmount,
  );
  const netAmount = enteredNet
    ? numberValue(formData, "net_amount")
    : calculatedNet;

  const { error } = await supabase
    .from("visits")
    .update({
      person_id: personId || null,
      visited_at: visitedAt
        ? new Date(visitedAt).toISOString()
        : new Date().toISOString(),
      visit_type: text(formData, "visit_type") || "walk_in",
      party_size: Math.max(1, numberValue(formData, "party_size", 1)),
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      tax_amount: taxAmount,
      net_amount: netAmount,
      payment_method: text(formData, "payment_method") || null,
      order_reference: text(formData, "order_reference") || null,
      source: text(formData, "source") || "manual",
      visit_context: text(formData, "visit_context") || null,
      seating_area: text(formData, "seating_area") || null,
      table_reference: text(formData, "table_reference") || null,
      staff_notes: text(formData, "staff_notes") || null,
      customer_mood: text(formData, "customer_mood") || null,
      satisfaction_score: optionalNumber(
        formData,
        "satisfaction_score",
      ),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) redirectError(id, error.message);

  const { error: timelineError } = await supabase
    .from("timeline_entries")
    .update({
      person_id: personId || null,
      summary:
        text(formData, "visit_context") ||
        `Recorded spend: ₹${netAmount.toFixed(0)}`,
      occurred_at: visitedAt
        ? new Date(visitedAt).toISOString()
        : new Date().toISOString(),
    })
    .eq("source_type", "visit")
    .eq("source_id", id);

  if (timelineError) redirectError(id, timelineError.message);

  revalidateVisit(id, personId || null);
  redirect(visitPath(id, "success", "Visit updated"));
}

export async function addVisitItem(id: string, formData: FormData) {
  const { supabase } = await requireUser();

  const itemName = text(formData, "item_name");
  if (!itemName) redirectError(id, "Item name is required");

  const quantity = Math.max(
    0.01,
    numberValue(formData, "quantity", 1),
  );
  const unitPrice = Math.max(
    0,
    numberValue(formData, "unit_price"),
  );
  const totalAmount = quantity * unitPrice;

  const { error } = await supabase.from("visit_items").insert({
    visit_id: id,
    item_name: itemName,
    category: text(formData, "category") || null,
    quantity,
    unit_price: unitPrice,
    total_amount: totalAmount,
    notes: text(formData, "notes") || null,
  });

  if (error) redirectError(id, error.message);

  const { data: items, error: itemsError } = await supabase
    .from("visit_items")
    .select("total_amount")
    .eq("visit_id", id);

  if (itemsError) redirectError(id, itemsError.message);

  const grossAmount = (items ?? []).reduce(
    (sum, item) => sum + Number(item.total_amount ?? 0),
    0,
  );

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("discount_amount, tax_amount, person_id")
    .eq("id", id)
    .single();

  if (visitError) redirectError(id, visitError.message);

  const netAmount = Math.max(
    0,
    grossAmount -
      Number(visit.discount_amount ?? 0) +
      Number(visit.tax_amount ?? 0),
  );

  const { error: updateError } = await supabase
    .from("visits")
    .update({
      gross_amount: grossAmount,
      net_amount: netAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) redirectError(id, updateError.message);

  revalidateVisit(id, visit.person_id);
  redirect(visitPath(id, "success", "Item added"));
}

export async function deleteVisitItem(
  visitId: string,
  itemId: string,
) {
  const { supabase } = await requireUser();

  const { error } = await supabase
    .from("visit_items")
    .delete()
    .eq("id", itemId)
    .eq("visit_id", visitId);

  if (error) redirectError(visitId, error.message);

  const { data: items, error: itemsError } = await supabase
    .from("visit_items")
    .select("total_amount")
    .eq("visit_id", visitId);

  if (itemsError) redirectError(visitId, itemsError.message);

  const grossAmount = (items ?? []).reduce(
    (sum, item) => sum + Number(item.total_amount ?? 0),
    0,
  );

  const { data: visit, error: visitError } = await supabase
    .from("visits")
    .select("discount_amount, tax_amount, person_id")
    .eq("id", visitId)
    .single();

  if (visitError) redirectError(visitId, visitError.message);

  const netAmount = Math.max(
    0,
    grossAmount -
      Number(visit.discount_amount ?? 0) +
      Number(visit.tax_amount ?? 0),
  );

  const { error: updateError } = await supabase
    .from("visits")
    .update({
      gross_amount: grossAmount,
      net_amount: netAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", visitId);

  if (updateError) redirectError(visitId, updateError.message);

  revalidateVisit(visitId, visit.person_id);
  redirect(visitPath(visitId, "success", "Item removed"));
}

export async function deleteVisit(id: string) {
  const { supabase } = await requireUser();

  const { data: visit, error: readError } = await supabase
    .from("visits")
    .select("person_id")
    .eq("id", id)
    .single();

  if (readError) redirectError(id, readError.message);

  const { error: timelineError } = await supabase
    .from("timeline_entries")
    .delete()
    .eq("source_type", "visit")
    .eq("source_id", id);

  if (timelineError) redirectError(id, timelineError.message);

  const { error } = await supabase
    .from("visits")
    .delete()
    .eq("id", id);

  if (error) redirectError(id, error.message);

  revalidateVisit(undefined, visit.person_id);
  redirect("/visits?success=Visit%20deleted");
}
