import { NextResponse } from "next/server";
import { autenticarApiKey } from "@/lib/api/auth";
import { EVENTOS_WEBHOOK } from "@/lib/webhooks/sinal";

export async function GET(req: Request) {
  const a = await autenticarApiKey(req);
  if (!a.auth) return NextResponse.json({ erro: { codigo: "nao_autorizado", mensagem: a.erro } }, { status: a.status });
  return NextResponse.json({ dados: { eventos: EVENTOS_WEBHOOK } });
}
