import { NextResponse } from "next/server";
import { usageStats } from "@/lib/containers/jsoncargo";
import { trackerMode } from "@/lib/containers/track";

// How much of the JSONCargo plan's request allowance is left.
export async function GET() {
  if (trackerMode() !== "live") return NextResponse.json({ demo: true });
  try {
    const s = await usageStats();
    return NextResponse.json({ demo: false, plan: s.plan ?? null, total: s.requests_total ?? null, used: s.requests_made ?? null, left: s.requests_available ?? null });
  } catch (e) {
    return NextResponse.json({ demo: false, error: e instanceof Error ? e.message : String(e) });
  }
}
