export const ACERVO_PADRAO: string[] = [
  "Livros contábeis (Diário, Razão) e LALUR",
  "Balancetes, balanços e demonstrações",
  "Guias de recolhimento pagas (federais, estaduais e municipais)",
  "Declarações e obrigações acessórias entregues (SPED, DCTFWeb, ECD/ECF)",
  "Notas fiscais de entrada e de saída",
  "Folhas de pagamento e obrigações trabalhistas (eSocial, FGTS)",
  "Contratos sociais e alterações societárias",
  "Certificado digital",
  "Procurações e acessos a portais (e-CAC, prefeitura, etc.)",
  "Extratos e conciliações bancárias",
];

export type DadosTermo = {
  tipo: "transferencia_entrada" | "transferencia_saida";
  cliente: string;
  marca: { nome: string | null; cnpj: string | null; enderecoLinha: string };
  itens: string[];
  data: string; // ISO yyyy-mm-dd
  responsavel: string | null;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function dataBR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function montarTermoHtml(d: DadosTermo): string {
  const entrada = d.tipo === "transferencia_entrada";
  const acao = entrada ? "Recebimento" : "Entrega";
  const verbo = entrada
    ? "recebido do cliente abaixo identificado, ou da contabilidade anterior,"
    : "entregue ao cliente abaixo identificado, ou à contabilidade sucessora,";
  const itens = d.itens
    .filter((i) => i.trim())
    .map((i) => `<li>${esc(i.trim())}</li>`)
    .join("");
  const marcaLinha = [d.marca.cnpj && `CNPJ ${esc(d.marca.cnpj)}`, esc(d.marca.enderecoLinha)]
    .filter(Boolean)
    .join(" · ");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body{font-family:-apple-system,system-ui,Arial,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px;line-height:1.5}
  h1{font-size:18px;text-align:center;margin:0 0 4px}
  .sub{text-align:center;color:#555;font-size:12px;margin-bottom:20px}
  .marca{font-weight:600}
  ul{margin:12px 0 12px 20px}
  .assin{display:flex;gap:40px;margin-top:56px}
  .assin div{flex:1;text-align:center;border-top:1px solid #111;padding-top:6px;font-size:12px}
  .data{margin-top:28px}
</style></head><body>
  <p class="marca">${esc(d.marca.nome ?? "")}</p>
  ${marcaLinha ? `<p style="font-size:12px;color:#555;margin-top:2px">${marcaLinha}</p>` : ""}
  <h1>Termo de ${acao} de Acervo Documental</h1>
  <p class="sub">Em conformidade com a NBC PG 01</p>
  <p>Declaramos, para os devidos fins, que foi ${verbo} referente ao cliente
  <strong>${esc(d.cliente)}</strong>, o acervo documental composto pelos itens a seguir:</p>
  <ul>${itens}</ul>
  <p class="data">Local e data: ______________________, ${dataBR(d.data)}.</p>
  <div class="assin">
    <div>${esc(d.responsavel ?? "")}<br>${esc(d.marca.nome ?? "Escritório")}</div>
    <div>Cliente / Contabilidade ${entrada ? "anterior" : "sucessora"}</div>
  </div>
</body></html>`;
}
