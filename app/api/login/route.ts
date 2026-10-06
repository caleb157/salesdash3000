import { NextResponse } from "next/server";
import { COOKIE, expectedToken, safeEqual } from "@/lib/auth";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const expectedPassword = process.env.DASHBOARD_PASSWORD ?? "";
  const token = await expectedToken();
  const url = new URL(req.url);

  if (!token || !safeEqual(password, expectedPassword)) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.redirect(new URL("/login?error=1", url), 303);
  }
  const res = NextResponse.redirect(new URL("/", url), 303);
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
