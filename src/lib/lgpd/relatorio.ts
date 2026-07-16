import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

export type SecaoRelatorio = { titulo: string; linhas: Record<string, unknown>[] };
export type RelatorioTitular = {
  clienteId: string;
  clienteNome: string;
  geradoEm: string;
  secoes: SecaoRelatorio[];
};

// Reúne TUDO o que o sistema guarda sobre um cliente e as pessoas ligadas a ele.
// Roda com service_role: é um relatório de conformidade, admin-only na action.
export async function montarRelatorio(clienteId: string, hojeIso: string): Promise<RelatorioTitular | null> {
  const admin = createAdminSupabase();

  const { data: cli } = await admin.from("clientes").select("*").eq("id", clienteId).maybeSingle();
  if (!cli) return null;

  const uma = async (tabela: string, cols: string, limite = 200): Promise<Record<string, unknown>[]> => {
    const { data } = await admin.from(tabela).select(cols).eq("cliente_id", clienteId).limit(limite);
    return (data ?? []) as unknown as Record<string, unknown>[];
  };

  const secoes: SecaoRelatorio[] = [
    {
      titulo: "Cadastro",
      linhas: [
        {
          razao_social: cli.razao_social,
          nome_fantasia: cli.nome_fantasia,
          cpf_cnpj: cli.cpf_cnpj,
          email: cli.email,
          telefone: cli.telefone,
          responsavel_nome: cli.responsavel_nome,
          representante: cli.representante,
          endereco: cli.endereco,
          regime_tributario: cli.regime_tributario,
          status: cli.status,
          data_inicio: cli.data_inicio,
        },
      ],
    },
    {
      titulo: "Financeiro",
      linhas: await uma(
        "clientes_financeiro",
        "honorario_mensal, dia_vencimento, data_saida, cobranca_whatsapp, cobranca_email",
      ),
    },
    { titulo: "Documentos", linhas: await uma("documentos", "nome, tipo, origem, enviado_em") },
    { titulo: "Notas fiscais (NFS-e)", linhas: await uma("nfse", "numero, competencia, valor, criado_em") },
    { titulo: "Títulos", linhas: await uma("titulo", "tipo, valor, vencimento, status, competencia") },
    { titulo: "E-mails enviados", linhas: await uma("email_mensagem", "para, assunto, status, criado_em") },
    { titulo: "Comunicados", linhas: await uma("comunicado_destinatario", "para, status, criado_em") },
    { titulo: "Acessos ao portal", linhas: await uma("portal_acesso", "tipo, ref_id, acessado_em") },
    { titulo: "Solicitações", linhas: await uma("solicitacao", "numero, assunto, categoria, status, criado_em") },
    {
      titulo: "Consentimentos",
      linhas:
        ((
          await admin
            .from("lgpd_consentimento_evento")
            .select("tipo, concedido, origem, criado_em")
            .eq("cliente_id", clienteId)
            .order("criado_em", { ascending: false })
        ).data as unknown as Record<string, unknown>[]) ?? [],
    },
  ];

  return {
    clienteId,
    clienteNome: (cli.razao_social as string) ?? "—",
    geradoEm: hojeIso,
    secoes,
  };
}

const escapar = (v: unknown): string =>
  String(v ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// HTML sanitizado (sem <script>/on*, só texto escapado) para o Gotenberg.
export function relatorioParaHtml(rel: RelatorioTitular): string {
  const secoes = rel.secoes
    .map((s) => {
      const corpo =
        s.linhas.length === 0
          ? "<p style='color:#888'>Nenhum registro.</p>"
          : s.linhas
              .map(
                (l) =>
                  "<table style='width:100%;border-collapse:collapse;margin:4px 0;font-size:12px'>" +
                  Object.entries(l)
                    .map(
                      ([k, v]) =>
                        `<tr><td style='padding:2px 8px;color:#666;width:30%'>${escapar(k)}</td>` +
                        `<td style='padding:2px 8px'>${escapar(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`,
                    )
                    .join("") +
                  "</table>",
              )
              .join("<hr style='border:none;border-top:1px solid #eee'>");
      return `<h2 style='font-size:14px;border-bottom:2px solid #333;padding-bottom:2px'>${escapar(s.titulo)}</h2>${corpo}`;
    })
    .join("");

  return (
    "<html><head><meta charset='utf-8'></head><body style='font-family:sans-serif;color:#222'>" +
    `<h1 style='font-size:18px'>Relatório de dados do titular</h1>` +
    `<p style='font-size:12px;color:#666'>${escapar(rel.clienteNome)} · gerado em ${escapar(rel.geradoEm)}</p>` +
    `<p style='font-size:11px;color:#888'>Documento emitido em atenção ao direito de acesso do titular (LGPD art. 18, II).</p>` +
    secoes +
    "</body></html>"
  );
}

export function relatorioParaJson(rel: RelatorioTitular): string {
  return JSON.stringify(rel, null, 2);
}
