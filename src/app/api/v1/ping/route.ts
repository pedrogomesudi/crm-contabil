import { NextResponse } from "next/server";
import { autenticarApiKey } from "@/lib/api/auth";

export async function GET(req: Request) {
  const r = await autenticarApiKey(req);
  if (!r.auth) {
    return NextResponse.json({ erro: { codigo: "nao_autorizado", mensagem: r.erro } }, { status: r.status });
  }
  return NextResponse.json({ ok: true, escopos: r.auth.escopos });
}
