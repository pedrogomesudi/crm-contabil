import { NextResponse } from "next/server";
import { documentoOpenApi } from "@/lib/api/openapi";

export function GET() {
  return NextResponse.json(documentoOpenApi());
}
