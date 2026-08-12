"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { lerDanfseStorage, gerarDanfseFiel } from "@/lib/nfse/danfse-cache";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Motivo curto para agrupar falhas semelhantes ao gerar o DANFSe.
function chaveMotivo(erro: string): string {
  if (/XML/i.test(erro)) return "XML da nota ausente";
  if (/PDF|Gotenberg|indisponível/i.test(erro)) return "Serviço de PDF indisponível";
  if (/chave/i.test(erro)) return "Nota sem chave de acesso";
  return erro.slice(0, 60);
}

export type ResultadoPreparo = {
  ok: number; // geradas com sucesso nesta chamada
  jaTinha: number; // já estavam em cache
  restantes: number; // ainda sem PDF (chamar de novo para continuar)
  erros: { motivo: string; qtd: number }[]; // agrupado
};

// Gera as DANFSe faltantes de UMA competência (layout oficial v2.0, pelo XML autorizado),
// SERIALIZADO e com espera entre gerações para não sobrecarregar o Gotenberg. Popula o cache
// no Storage, de onde os downloads/envios em lote passam a vir prontos. Processa até `limite`
// por chamada (o resto vira `restantes`, para a tela chamar de novo) e agrupa os motivos de
// falha. Desde a NT 008/2026 o ADN não entrega mais o oficial — o gerado aqui É o oficial.
export async function prepararDanfse(competencia: string, limite = 8): Promise<ResultadoPreparo> {
  if (!(await gate())) return { ok: 0, jaTinha: 0, restantes: 0, erros: [{ motivo: "Sem permissão.", qtd: 1 }] };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { ok: 0, jaTinha: 0, restantes: 0, erros: [] };
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("nfse")
    .select("chave_acesso, ambiente, emitente, cliente_id")
    .eq("status", "autorizada")
    .eq("competencia", competencia)
    .order("numero");
  const notas = (data ?? []) as {
    chave_acesso: string | null;
    ambiente: string | null;
    emitente: string;
    cliente_id: string;
  }[];

  let ok = 0;
  let jaTinha = 0;
  let baixadas = 0;
  let restantes = 0;
  const errosMap = new Map<string, number>();

  for (const n of notas) {
    if (!n.chave_acesso) continue;
    if (baixadas >= limite) {
      restantes++; // não lê cache além do limite — mantém a chamada dentro do tempo
      continue;
    }
    const cache = await lerDanfseStorage(admin, n.chave_acesso);
    if (cache) {
      jaTinha++;
      continue;
    }
    const r = await gerarDanfseFiel(admin, {
      chave_acesso: n.chave_acesso,
      ambiente: n.ambiente,
      emitente: n.emitente,
      cliente_id: n.cliente_id,
    });
    baixadas++;
    if (r.pdfBase64) ok++;
    else {
      const k = chaveMotivo(r.erro ?? "Falha desconhecida");
      errosMap.set(k, (errosMap.get(k) ?? 0) + 1);
    }
    await delay(300); // respira entre gerações para não sobrecarregar o Gotenberg
  }

  const erros = [...errosMap.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd);
  return { ok, jaTinha, restantes, erros };
}
