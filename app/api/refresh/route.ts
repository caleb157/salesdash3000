import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

// Drops the 10-minute Odoo cache so the next page load pulls fresh numbers.
export async function POST(req: Request) {
  revalidateTag("odoo", { expire: 0 });
  const back = req.headers.get("referer") ?? "/";
  return NextResponse.redirect(new URL(back, req.url), 303);
}
