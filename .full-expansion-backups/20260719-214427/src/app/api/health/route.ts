import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "The 11th Bean Platform",
    timestamp: new Date().toISOString(),
  });
}
