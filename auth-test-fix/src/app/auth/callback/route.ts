import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_OTP_TYPES = new Set<EmailOtpType>([
  "email",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const rawType = url.searchParams.get("type");
  const next = url.searchParams.get("next") || "/settings";

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(error.message)}`,
          url.origin,
        ),
      );
    }

    return NextResponse.redirect(new URL(next, url.origin));
  }

  if (
    tokenHash &&
    rawType &&
    ALLOWED_OTP_TYPES.has(rawType as EmailOtpType)
  ) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    });

    if (error) {
      return NextResponse.redirect(
        new URL(
          `/login?error=${encodeURIComponent(error.message)}`,
          url.origin,
        ),
      );
    }

    return NextResponse.redirect(new URL(next, url.origin));
  }

  return NextResponse.redirect(
    new URL(
      "/login?error=Missing%20authentication%20credentials",
      url.origin,
    ),
  );
}
