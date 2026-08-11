import type { DadosDanfse, EnderecoDanfse } from "./danfse-parse";

// Monta o HTML do DANFSe reproduzindo o layout oficial da SEFIN Nacional. Renderizado em PDF
// pelo Gotenberg (Chromium). Puro: recebe os dados + o QR Code já como data URI.

const D = "-";
const esc = (t: string) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const fmtDoc = (d: string) => {
  const x = String(d ?? "").replace(/\D/g, "");
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d || D;
};
const fmtCep = (c: string) => {
  const x = String(c ?? "").replace(/\D/g, "");
  return x.length === 8 ? x.replace(/^(\d{5})(\d{3})$/, "$1-$2") : c || D;
};
const fmtMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || D;
};
const fmtDataHora = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtData(iso);
};
const endLinha = (e: EnderecoDanfse) =>
  [[e.logradouro, e.numero].filter(Boolean).join(", "), e.bairro].filter(Boolean).join(", ") || D;
const munUf = (e: EnderecoDanfse) => (e.municipio ? `${e.municipio}${e.uf ? " - " + e.uf : ""}` : D);

// Uma célula "campo": rótulo pequeno + valor. flex = peso da largura na linha.
function campo(rotulo: string, valor: string, flex = 1): string {
  return `<td style="width:${flex}%"><div class="rot">${esc(rotulo)}</div><div class="val">${esc(valor || D)}</div></td>`;
}
function linha(celulas: string): string {
  return `<table class="grid"><tr>${celulas}</tr></table>`;
}
function barra(titulo: string): string {
  return `<div class="barra">${esc(titulo)}</div>`;
}

export function montarDanfseHtml(d: DadosDanfse, qrDataUri: string): string {
  const homolog = d.producao ? "" : `<div class="homolog">AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL</div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 8px; margin: 0; }
  .doc { width: 100%; }
  .head { display: table; width: 100%; border: 1px solid #333; }
  .head .col { display: table-cell; vertical-align: top; padding: 6px 8px; }
  .head .id { width: 62%; }
  .head .titulo { font-size: 20px; font-weight: 700; letter-spacing: -0.5px; }
  .head .titulo small { font-size: 9px; font-weight: 400; color: #555; }
  .head .sub { font-size: 8px; color: #555; margin-top: 1px; }
  .head .pref { font-size: 9px; font-weight: 700; margin-top: 4px; }
  .head .chave { width: 38%; border-left: 1px solid #333; text-align: center; }
  .head .chave .rot { font-size: 6px; color: #555; text-transform: uppercase; letter-spacing: .3px; }
  .head .chave .num { font-size: 8px; font-weight: 700; word-break: break-all; margin: 2px 0 4px; }
  .head .chave img { width: 78px; height: 78px; }
  .head .chave .aut { font-size: 6px; color: #555; margin-top: 3px; line-height: 1.25; }
  .homolog { color: #a5570a; font-weight: 700; font-size: 8px; margin-top: 3px; }
  .barra { background: #33383f; color: #fff; font-weight: 700; font-size: 7.5px; text-transform: uppercase;
           letter-spacing: .4px; padding: 3px 8px; margin-top: -1px; }
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid td { border: 1px solid #cfd3d8; padding: 3px 6px; vertical-align: top; }
  .rot { font-size: 5.8px; color: #6a7078; text-transform: uppercase; letter-spacing: .2px; }
  .val { font-size: 8px; font-weight: 700; color: #111; margin-top: 1px; word-wrap: break-word; }
  .foot { font-size: 6.2px; color: #6a7078; margin-top: 6px; }
</style></head><body><div class="doc">

  <div class="head">
    <div class="col id">
      <div class="titulo">DANFSe <small>v1.0</small></div>
      <div class="sub">Documento Auxiliar da NFS-e</div>
      <div class="pref">Prefeitura Municipal de ${esc(d.localEmissao || D)}</div>
      ${homolog}
    </div>
    <div class="col chave">
      <div class="rot">Chave de Acesso da NFS-e</div>
      <div class="num">${esc(d.chave)}</div>
      ${qrDataUri ? `<img src="${qrDataUri}" alt="QR Code" />` : ""}
      <div class="aut">A autenticidade pode ser verificada pela leitura do QR Code ou pela consulta da chave no portal nacional da NFS-e.</div>
    </div>
  </div>

  ${linha(
    campo("Número da NFS-e", d.numero, 16) +
      campo("Competência", fmtData(d.competencia), 14) +
      campo("Emissão da NFS-e", fmtDataHora(d.dataEmissaoNfse), 24) +
      campo("Número da DPS", d.numeroDps, 14) +
      campo("Série", d.serieDps, 8) +
      campo("Emissão da DPS", fmtDataHora(d.dataEmissaoDps), 24),
  )}

  ${barra("Emitente da NFS-e — Prestador do Serviço")}
  ${linha(campo("CNPJ / CPF / NIF", fmtDoc(d.prestador.documento), 34) + campo("Inscrição Municipal", D, 33) + campo("Telefone", D, 33))}
  ${linha(campo("Nome / Nome Empresarial", d.prestador.nome, 62) + campo("E-mail", d.prestador.email || D, 38))}
  ${linha(campo("Endereço", endLinha(d.prestador.endereco), 60) + campo("Município", munUf(d.prestador.endereco), 25) + campo("CEP", fmtCep(d.prestador.endereco.cep), 15))}
  ${linha(campo("Optante pelo Simples Nacional (na competência)", d.prestador.optanteSN, 42) + campo("Regime de Apuração", d.prestador.regimeApuracaoSN, 58))}

  ${barra("Tomador do Serviço")}
  ${linha(campo("CNPJ / CPF / NIF", fmtDoc(d.tomador.documento), 34) + campo("Inscrição Municipal", D, 33) + campo("Telefone", D, 33))}
  ${linha(campo("Nome / Nome Empresarial", d.tomador.nome, 62) + campo("E-mail", d.tomador.email || D, 38))}
  ${linha(campo("Endereço", endLinha(d.tomador.endereco), 60) + campo("Município", munUf(d.tomador.endereco), 25) + campo("CEP", fmtCep(d.tomador.endereco.cep), 15))}

  ${barra("Intermediário do Serviço")}
  ${linha(campo("Intermediário", "NÃO IDENTIFICADO NA NFS-e", 100))}

  ${barra("Serviço Prestado")}
  ${linha(campo("Código de Tributação Nacional", `${d.servico.codigoNac} — ${d.servico.descricaoNacional}`, 62) + campo("Cód. Trib. Municipal", d.servico.codigoMun || D, 18) + campo("Local da Prestação", d.localPrestacao || D, 20))}
  ${linha(campo("Descrição do Serviço", d.servico.descricao, 100))}

  ${barra("Tributação Municipal")}
  ${linha(campo("Tributação do ISSQN", d.issqn.tributacao, 28) + campo("Município de Incidência", d.municipioIncidencia || D, 28) + campo("Regime Especial", d.issqn.regimeEspecial, 22) + campo("Retenção do ISSQN", d.issqn.retencao, 22))}

  ${barra("Tributação Federal")}
  ${linha(campo("IRRF", D, 20) + campo("Contrib. Previdenciária Retida", D, 20) + campo("PIS", D, 20) + campo("COFINS", D, 20) + campo("Outras Retenções", D, 20))}

  ${barra("Valor Total da NFS-e")}
  ${linha(campo("Valor do Serviço", fmtMoeda(d.valores.servico), 22) + campo("Descontos", D, 18) + campo("ISSQN Retido", D, 18) + campo("Total Retenções Federais", D, 20) + campo("Valor Líquido da NFS-e", fmtMoeda(d.valores.liquido), 22))}

  ${barra("Totais Aproximados dos Tributos (Lei 12.741/2012)")}
  ${linha(
    campo("Federais", D, 33) +
      campo("Estaduais", D, 33) +
      campo(
        `Municipais${d.valores.aliqAproxTrib != null ? ` (aprox. ${d.valores.aliqAproxTrib.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%)` : ""}`,
        d.valores.aliqAproxTrib != null ? fmtMoeda((d.valores.servico * d.valores.aliqAproxTrib) / 100) : D,
        34,
      ),
  )}

  ${barra("Informações Complementares")}
  ${linha(campo("DFe nº", d.dfe || D, 100))}

  <div class="foot">DANFSe gerado pelo SALDO a partir do XML autorizado da NFS-e. O documento fiscal é a NFS-e (XML). Consulte a autenticidade em www.nfse.gov.br pela chave de acesso.</div>
</div></body></html>`;
}
