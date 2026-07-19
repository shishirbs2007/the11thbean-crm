import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const { supabase } = await requireUser();

  const { data, error } = await supabase
    .from("people")
    .select(
      "id, first_name, last_name, preferred_name, phone, email, date_of_birth, anniversary_date, occupation, company, person_type, customer_status, created_at",
    )
    .eq("is_active", true)
    .order("created_at");

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  const headers = [
    "id",
    "first_name",
    "last_name",
    "preferred_name",
    "phone",
    "email",
    "date_of_birth",
    "anniversary_date",
    "occupation",
    "company",
    "person_type",
    "customer_status",
    "created_at",
  ];

  const rows = (data ?? []).map((row) =>
    headers.map((header) => csvCell(row[header as keyof typeof row])).join(","),
  );

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition":
        'attachment; filename="the11thbean-customers.csv"',
    },
  });
}
