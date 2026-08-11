"use server";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { podeVerHonorario } from "@/lib/clientes/permissoes";
import { lerDanfseStorage, baixarDanfseOficial } from "@/lib/nfse/danfse-cache";

async function gate() {
  const p = await getPerfilAtual();
  return p?.ativo && podeVerHonorario(p.papel) ? p : null;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Motivo curto para agrupar erros semelhantes (o ADN devolve códigos/textos variados).
function chaveMotivo(erro: string): string {
  const http = /HTTP (\d{3})/.exec(erro);
  if (http) return `ADN HTTP ${http[1]}`;
  if (/tempo esgotado|timeout/i.test(erro)) return "Tempo esgotado (ADN)";
  if (/rede|TLS/i.test(erro)) return "Rede/TLS com o ADN";
  if (/certificado/i.test(erro)) return "Certificado";
  return erro.slice(0, 60);
}

export type ResultadoPreparo = {
  ok: number; // baixadas com sucesso nesta chamada
  jaTinha: number; // já estavam em cache
  restantes: number; // ainda sem PDF (chamar de novo para continuar)
  erros: { motivo: string; qtd: number }[]; // agrupado
};

// Baixa as DANFSe faltantes de UMA competência, SERIALIZADO e com espera entre downloads —
// o oposto do lote concorrente que satura o ADN. Processa até `limite` downloads por chamada
// (o resto vira `restantes`, para a tela chamar de novo) e agrupa os motivos de falha, para
// diagnosticar por que o ADN recusa (rate limit, 404, timeout…).
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
    const r = await baixarDanfseOficial(admin, {
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
    await delay(800); // respira entre downloads para não saturar o ADN (evita o 429)
  }

  const erros = [...errosMap.entries()].map(([motivo, qtd]) => ({ motivo, qtd })).sort((a, b) => b.qtd - a.qtd);
  return { ok, jaTinha, restantes, erros };
}
