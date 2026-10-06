import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, expectedToken, safeEqual } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const token = await expectedToken();
  if (!token) {
    return new NextResponse("DASHBOARD_PASSWORD is not set. Add it in your Vercel environment variables.", { status: 503 });
  }
  const cookie = req.cookies.get(COOKIE)?.value ?? "";
  if (safeEqual(cookie, token)) return NextResponse.next();

  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the login page/endpoint and static assets.
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
