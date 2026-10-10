import { NextResponse } from "next/server";
import { isCarrier } from "@/lib/containers/numbers";
import { invalidate, track } from "@/lib/containers/track";

// POST { number, carrier?, kind? } -> TrackResult. With { invalidate: true } it only drops the cached data,
// so the client's next (separate) request fetches fresh. Sits behind the dashboard login (see proxy.ts).
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send JSON" }, { status: 400 });
  }
  const number = typeof body.number === "string" ? body.number : "";
  const carrier = isCarrier(body.carrier) ? body.carrier : null;
  const kind = body.kind === "container" || body.kind === "bl" ? body.kind : null;
  if (body.invalidate === true) {
    invalidate({ number, carrier, kind });
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  }
  const result = await track({ number, carrier, kind });
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
