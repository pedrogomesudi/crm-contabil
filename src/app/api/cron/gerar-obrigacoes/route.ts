import { NextResponse } from "next/server";
import { executarCronComPing } from "@/lib/observabilidade/healthcheck";
import { timingSafeEqual } from "node:crypto";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { gerarInstancias } from "@/lib/obrigacoes/motor";

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
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const resumo = await executarCronComPing("gerar-obrigacoes", () =>
    gerarInstancias(createAdminSupabase(), ano, mes),
  );
  return NextResponse.json(resumo);
}
