import { NextResponse } from "next/server";

// Health check de deploy: sempre executado em runtime, nunca prerenderizado/cacheado.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
