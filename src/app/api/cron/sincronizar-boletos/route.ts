import { NextResponse } from "next/server";
import { executarCronComPing } from "@/lib/observabilidade/healthcheck";
import { timingSafeEqual } from "node:crypto";
import { sincronizarBoletosCore } from "@/app/(app)/financeiro/contas-a-receber/sincronizar";

function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(token);
  const b = Buffer.from(segredo);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const resumo = await executarCronComPing("sincronizar-boletos", () => sincronizarBoletosCore());
  return NextResponse.json(resumo);
}
