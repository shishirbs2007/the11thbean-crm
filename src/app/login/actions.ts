"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function verifyPin(formData: FormData) {
  const pin = String(formData.get("pin") || "").trim();

  const roles: Record<string, string> = {
    "0000": "admin",
    "1111": "manager",
    "2222": "barista",
  };

  const role = roles[pin];

  if (!role) {
    redirect("/login?error=Incorrect%20PIN");
  }

  const cookieStore = await cookies();

  cookieStore.set("bean_role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect("/dashboard");
}

export async function signOut() {
  const cookieStore = await cookies();
  cookieStore.delete("bean_role");
  cookieStore.delete("bean_store");
  redirect("/login");
}
