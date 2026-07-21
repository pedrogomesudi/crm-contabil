import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { consultarCnpj } from "@/lib/receita/brasilapi";
import { detectarMudancas } from "@/lib/receita/monitoramento";

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Varre clientes ativos com CNPJ cuja verificação está vencida (frequencia_dias) e reconsulta,
// espaçando as chamadas para não estourar o 429 da BrasilAPI. Só roda se a config estiver ativa.
export async function monitorarReceitaCore(): Promise<{ consultados: number; alertas: number; erros: number }> {
  const admin = createAdminSupabase();
  const { data: cfg } = await admin.from("receita_config").select("ativo, frequencia_dias").eq("id", 1).maybeSingle();
  if (!cfg?.ativo) return { consultados: 0, alertas: 0, erros: 0 };

  const freq = Number(cfg.frequencia_dias) || 7;
  const cutoff = new Date(Date.now() - freq * 86400000).toISOString();
  const { data: clientes } = await admin
    .from("clientes")
    .select("id, cpf_cnpj, situacao_cadastral, optante_simples")
    .is("excluido_em", null)
    .eq("status", "ativo")
    .or(`situacao_verificada_em.is.null,situacao_verificada_em.lt.${cutoff}`)
    .limit(300);

  let consultados = 0;
  let alertasTotal = 0;
  let erros = 0;
  for (const c of clientes ?? []) {
    const doc = String(c.cpf_cnpj ?? "").replace(/\D/g, "");
    if (doc.length !== 14) continue;
    await esperar(400); // throttle anti-429
    const r = await consultarCnpj(doc);
    if (r.erro || !r.dados) {
      erros += 1;
      continue;
    }
    consultados += 1;
    const alertas = detectarMudancas(
      {
        situacao: (c.situacao_cadastral as string | null) ?? null,
        optanteSimples: (c.optante_simples as boolean | null) ?? null,
      },
      { situacao: r.dados.situacao, optanteSimples: r.dados.optanteSimples },
    );
    await admin
      .from("clientes")
      .update({
        situacao_cadastral: r.dados.situacao,
        optante_simples: r.dados.optanteSimples,
        situacao_verificada_em: new Date().toISOString(),
      })
      .eq("id", c.id);
    if (alertas.length) {
      await admin
        .from("receita_alerta")
        .insert(alertas.map((a) => ({ cliente_id: c.id as string, tipo: a.tipo, de: a.de, para: a.para })));
      alertasTotal += alertas.length;
    }
  }
  return { consultados, alertas: alertasTotal, erros };
}
