import type { DadosDanfse, EnderecoDanfse } from "./danfse-parse";

// Monta o HTML do DANFSe reproduzindo o layout oficial v2.0 da SEFIN Nacional (com seções
// IBS/CBS da reforma tributária). Renderizado em PDF pelo Gotenberg. Puro: recebe os dados
// + o QR Code já como data URI. Campos não presentes no XML v1.0 saem como "-"/"R$ 0,00",
// como no DANFSe oficial.

const D = "-";
const Z = "R$ 0,00";
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
  return x.length === 8 ? x.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1.$2-$3") : c || D;
};
const fmtIbge = (c: string) => {
  const x = String(c ?? "").replace(/\D/g, "");
  return x.length === 7 ? `${x.slice(0, 2)}.${x.slice(2)}` : c || D;
};
const fmtTel = (t: string) => {
  let x = String(t ?? "").replace(/\D/g, "");
  if ((x.length === 12 || x.length === 13) && x.startsWith("55")) x = x.slice(2); // remove DDI
  if (x.length === 11) return x.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (x.length === 10) return x.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return t || D;
};
const fmtMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || D;
};
const fmtDataHora = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):?(\d{2})?/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6] ?? "00"}` : fmtData(iso);
};
const endLinha = (e: EnderecoDanfse) =>
  [[e.logradouro, e.numero].filter(Boolean).join(", "), e.bairro].filter(Boolean).join(", ") || D;
const munUf = (e: { municipio: string; uf: string }) => (e.municipio ? `${e.municipio} / ${e.uf || D}` : D);

// Célula "campo": rótulo pequeno + valor. Célula "sec": título de seção (fundo cinza).
const campo = (r: string, v: string, cs = 1) =>
  `<td colspan="${cs}"><div class="rot">${esc(r)}</div><div class="val">${esc(v || D)}</div></td>`;
const sec = (t: string, v?: string, cs = 1) =>
  `<td colspan="${cs}" class="sec"><div class="st">${esc(t)}</div>${v != null ? `<div class="sv">${esc(v)}</div>` : ""}</td>`;
const tr = (cells: string) => `<tr>${cells}</tr>`;

export function montarDanfseHtml(d: DadosDanfse, qrDataUri: string): string {
  const homolog = d.producao ? "" : `<span class="homolog"> · HOMOLOGAÇÃO (sem valor fiscal)</span>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 8mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 7.6px; margin: 0; }
  .head { display: table; width: 100%; border: 1px solid #444; border-bottom: none; }
  .head > div { display: table-cell; vertical-align: middle; padding: 5px 8px; }
  .head .logo { width: 200px; }
  .head .logo .nfs { font-size: 22px; font-weight: 800; color: #1f3b57; letter-spacing: -1px; }
  .head .logo .e { font-size: 22px; font-weight: 800; color: #2e9e5b; }
  .head .logo .lt { font-size: 7px; color: #2e9e5b; margin-left: 4px; line-height: 1.05; display: inline-block; vertical-align: middle; }
  .head .mid { text-align: center; }
  .head .mid .t1 { font-size: 13px; font-weight: 700; }
  .head .mid .t2 { font-size: 9px; font-weight: 700; }
  .head .amb { width: 180px; text-align: left; font-size: 7px; color: #333; }
  .homolog { color: #a5570a; font-weight: 700; }

  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid td { border: 1px solid #9aa0a6; padding: 2.5px 6px; vertical-align: top; height: 20px; }
  .rot { font-size: 5.6px; color: #40474f; }
  .val { font-size: 7.6px; font-weight: 700; color: #111; margin-top: 1px; word-wrap: break-word; line-height: 1.15; }
  td.sec { background: #dfe3e7; vertical-align: middle; }
  td.sec .st { font-size: 6.6px; font-weight: 700; text-transform: uppercase; letter-spacing: .2px; color: #23272c; }
  td.sec .sv { font-size: 7.6px; font-weight: 700; color: #111; margin-top: 1px; }
  td.chave { }
  td.chave .rot { font-size: 6px; }
  td.chave .num { font-size: 8.6px; font-weight: 700; word-break: break-all; margin-top: 1px; }
  td.qr { text-align: center; vertical-align: top; width: 150px; }
  td.qr img { width: 82px; height: 82px; }
  td.qr .aut { font-size: 5.5px; color: #40474f; margin-top: 2px; line-height: 1.2; text-align: left; }
  td.center { text-align: center; font-weight: 700; font-size: 7px; background: #f2f3f5; }
  .foot { width: 100%; border-collapse: collapse; margin-top: 0; table-layout: fixed; }
  .foot td { border: 1px solid #9aa0a6; height: 34px; vertical-align: top; padding: 3px 6px; font-size: 6px; color: #40474f; text-transform: uppercase; }
  .foot .rod { font-size: 7px; font-weight: 700; color: #111; text-transform: none; margin-top: 1px; word-break: break-all; }
</style></head><body>

  <div class="head">
    <div class="logo"><span class="nfs">NFS</span><span class="e">e</span> <span class="lt">Nota Fiscal de<br>Serviço eletrônica</span></div>
    <div class="mid"><div class="t1">DANFSe v2.0</div><div class="t2">Documento Auxiliar da NFS-e${homolog}</div></div>
    <div class="amb">Município: ${esc(munUf({ municipio: d.localEmissao, uf: d.ufEmitente }))}<br>Ambiente Gerador: ${esc(d.ambGer || D)}<br>Tipo de Ambiente: ${esc(d.tpAmb || D)}</div>
  </div>

  <table class="grid">
    ${tr(`<td colspan="3" class="chave"><div class="rot">CHAVE DE ACESSO DA NFS-e</div><div class="num">${esc(d.chave)}</div></td><td class="qr" rowspan="3"><img src="${qrDataUri}" alt="QR" /><div class="aut">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e.</div></td>`)}
    ${tr(campo("Número da NFS-e", d.numero) + campo("Competência da NFS-e", fmtData(d.competencia)) + campo("Data e Hora da Emissão da NFS-e", fmtDataHora(d.dataEmissaoNfse)))}
    ${tr(campo("Número da DPS", d.numeroDps) + campo("Série da DPS", d.serieDps) + campo("Data e Hora da Emissão da DPS", fmtDataHora(d.dataEmissaoDps)))}

    ${tr(sec("Emitente da NFS-e", "Prestador") + campo("Situação da NFS-e", "NFS-e Gerada") + campo("Finalidade", D, 2))}
    ${tr(sec("Prestador / Fornecedor") + campo("CNPJ / CPF / NIF", fmtDoc(d.prestador.documento)) + campo("Indicador Municipal (Inscrição)", D) + campo("Telefone", fmtTel(d.prestador.telefone)))}
    ${tr(campo("Nome / Nome Empresarial", d.prestador.nome, 2) + campo("Município / Sigla UF", munUf(d.prestador.endereco)) + campo("Código IBGE / CEP", `${fmtIbge(d.prestador.endereco.codigoIbge)} / ${fmtCep(d.prestador.endereco.cep)}`))}
    ${tr(campo("Endereço", endLinha(d.prestador.endereco), 2) + campo("E-mail", d.prestador.email || D, 2))}
    ${tr(campo("Simples Nacional na Data de Competência", d.prestador.optanteSN, 2) + campo("Regime de Apuração Tributária pelo SN", d.prestador.regimeApuracaoSN, 2))}

    ${tr(sec("Tomador / Adquirente") + campo("CNPJ / CPF / NIF", fmtDoc(d.tomador.documento)) + campo("Indicador Municipal (Inscrição)", D) + campo("Telefone", D))}
    ${tr(campo("Nome / Nome Empresarial", d.tomador.nome, 2) + campo("Município / Sigla UF", munUf(d.tomador.endereco)) + campo("Código IBGE / CEP", `${fmtIbge(d.tomador.endereco.codigoIbge)} / ${fmtCep(d.tomador.endereco.cep)}`))}
    ${tr(campo("Endereço", endLinha(d.tomador.endereco), 2) + campo("E-mail", d.tomador.email || D, 2))}
    ${tr(`<td colspan="4" class="center">DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</td>`)}
    ${tr(`<td colspan="4" class="center">INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</td>`)}

    ${tr(sec("Serviço Prestado") + campo("Cód. Tributação Nacional / Municipal", `${d.servico.codigoNac} / ${d.servico.codigoMun || D}`) + campo("Código da NBS", D) + campo("Local da Prestação / Sigla UF / País", `${d.localPrestacao || D} / ${d.ufEmitente || D} / -`))}
    ${tr(campo("Descrição (Tributação Nacional)", d.servico.descricaoNacional, 4))}
    ${tr(campo("Descrição do Serviço", d.servico.descricao, 4))}

    ${tr(sec("Tributação Municipal (ISSQN)") + campo("Tipo de Tributação do ISSQN", d.issqn.tributacao) + campo("Município / Sigla UF / País de Incidência do ISSQN", `${d.municipioIncidencia || D} / ${d.ufEmitente || D} / -`, 2))}
    ${tr(campo("BC ISSQN", D) + campo("Alíquota Aplicada", D) + campo("Retenção do ISSQN", d.issqn.retencao) + campo("ISSQN Apurado", D))}

    ${tr(sec("Tributação Federal (exceto CBS)") + campo("IRRF", D) + campo("Contribuição Previdenciária - Retida", D) + campo("Contribuições Sociais - Retidas", D))}
    ${tr(campo("PIS - Débito Apuração Própria", D) + campo("COFINS - Débito Apuração Própria", D) + campo("Descrição Contrib. Sociais - Retidas", D, 2))}

    ${tr(sec("Tributação IBS/CBS") + campo("CST / cClassTrib", `${D} / ${D}`) + campo("Indicador de Operação / Cód. IBGE / Município / UF", `${D} / ${D} / ${D} / ${D}`, 2))}
    ${tr(campo("Exclusões e Reduções da BC", Z) + campo("BC Após Exclusões e Reduções", D) + campo("Red. Alíq. IBS / CBS", `${D} / ${D}`) + campo("Alíquota - IBS UF / IBS Mun", `${D} / ${D}`))}
    ${tr(campo("Alíq. Efetiva Municipal - IBS", D) + campo("Valor Apurado Municipal - IBS", D) + campo("Alíq. Efetiva Estadual - IBS", D) + campo("Valor Apurado Estadual - IBS", D))}
    ${tr(campo("Valor Total Apurado - IBS", D) + campo("Alíquota - CBS", D) + campo("Alíquota Efetiva - CBS", D) + campo("Valor Total Apurado - CBS", D))}

    ${tr(sec("Valor Total da NFS-e") + campo("Valor da Operação / Serviço", fmtMoeda(d.valores.servico)) + campo("Desconto Incondicionado", D) + campo("Desconto Condicionado", D))}
    ${tr(campo("Total das Retenções (ISSQN / Federais)", D) + campo("Valor Líquido da NFS-e", fmtMoeda(d.valores.liquido)) + campo("Total do IBS/CBS", Z) + campo("Valor Líquido + IBS/CBS", fmtMoeda(d.valores.liquido)))}

    ${tr(sec("Informações Complementares", undefined, 4))}
    ${tr(campo(" ", `Totais aproximados dos Tributos cfe. Lei nº 12.741/2012: Federais: ${d.valores.aliqAproxTrib != null ? fmtMoeda((d.valores.servico * d.valores.aliqAproxTrib) / 100) : D}; Estaduais: -; Municipais: -;`, 4))}
  </table>

  <table class="foot">
    ${tr(`<td style="width:30%">Data Cientificação:</td><td style="width:30%">Identificação e Assinatura</td><td style="width:40%">N° NFS-e / Chave NFS-e<div class="rod">${esc(d.numero)} / ${esc(d.chave)}</div></td>`)}
  </table>

</body></html>`;
}
