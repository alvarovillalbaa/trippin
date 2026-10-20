import { NextResponse } from "next/server";
import { assistantReadiness } from "@/agent/lib/readiness";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(assistantReadiness(), {
    headers: { "Cache-Control": "no-store" },
  });
}
