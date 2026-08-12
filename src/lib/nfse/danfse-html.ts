import type { DadosDanfse, EnderecoDanfse } from "./danfse-parse";
import { LOGO_NFSE_DATA_URI } from "./danfse-logo";

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
  @page { size: A4; margin: 7mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 8px; margin: 0; }
  .head { display: table; width: 100%; border: 1px solid #555; border-bottom: none; }
  .head > div { display: table-cell; vertical-align: middle; padding: 6px 9px; }
  .head .logo { width: 230px; }
  .head .logo img { width: 215px; height: auto; display: block; }
  .head .mid { text-align: center; }
  .head .mid .t1 { font-size: 14px; font-weight: 700; }
  .head .mid .t2 { font-size: 10px; font-weight: 700; margin-top: 1px; }
  .head .amb { width: 190px; text-align: left; font-size: 8px; color: #222; line-height: 1.35; }
  .head .amb .m { font-size: 9px; }
  .homolog { color: #a5570a; font-weight: 700; }

  /* Padrão oficial v2.0: RÓTULO em negrito, VALOR em peso normal. */
  table.grid { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.grid td { border: 1px solid #8b9196; padding: 3px 6px; vertical-align: top; height: 23px; }
  .rot { font-size: 6.6px; font-weight: 700; color: #111; line-height: 1.15; }
  .val { font-size: 8.4px; font-weight: 400; color: #111; margin-top: 1.5px; word-wrap: break-word; line-height: 1.2; }
  td.sec { background: #dfe3e7; vertical-align: middle; }
  td.sec .st { font-size: 7.4px; font-weight: 700; letter-spacing: .2px; color: #111; }
  td.sec .sv { font-size: 8.4px; font-weight: 400; color: #111; margin-top: 1.5px; }
  td.chave .rot { font-size: 7px; }
  td.chave .num { font-size: 10px; font-weight: 400; word-break: break-all; margin-top: 1.5px; letter-spacing: .3px; }
  td.qr { text-align: center; vertical-align: top; width: 150px; }
  td.qr img { width: 88px; height: 88px; }
  td.qr .aut { font-size: 6.2px; color: #222; margin-top: 3px; line-height: 1.25; text-align: left; }
  td.center { text-align: center; font-weight: 700; font-size: 7.6px; background: #f2f3f5; }
  .foot { width: 100%; border-collapse: collapse; margin-top: 0; table-layout: fixed; }
  .foot td { border: 1px solid #8b9196; height: 40px; vertical-align: top; padding: 3px 6px; font-size: 6.6px; font-weight: 700; color: #111; text-transform: uppercase; }
  .foot .rod { font-size: 8px; font-weight: 400; color: #111; text-transform: none; margin-top: 1.5px; word-break: break-all; }
</style></head><body>

  <div class="head">
    <div class="logo"><img src="${LOGO_NFSE_DATA_URI}" alt="NFS-e — Nota Fiscal de Serviço eletrônica" /></div>
    <div class="mid"><div class="t1">DANFSe v2.0</div><div class="t2">Documento Auxiliar da NFS-e${homolog}</div></div>
    <div class="amb"><span class="m">Município: ${esc(d.localEmissao ? `${d.localEmissao} - ${d.ufEmitente || D}` : D)}</span><br>Ambiente Gerador: ${esc(d.ambGer || D)}<br>Tipo de Ambiente: ${esc(d.tpAmb || D)}</div>
  </div>

  <table class="grid">
    ${tr(`<td colspan="3" class="chave"><div class="rot">CHAVE DE ACESSO DA NFS-e</div><div class="num">${esc(d.chave)}</div></td><td class="qr" rowspan="3"><img src="${qrDataUri}" alt="QR" /><div class="aut">A autenticidade desta NFS-e pode ser verificada pela leitura deste código QR ou pela consulta da chave de acesso no portal nacional da NFS-e.</div></td>`)}
    ${tr(campo("NÚMERO DA NFS-e", d.numero) + campo("COMPETÊNCIA DA NFS-e", fmtData(d.competencia)) + campo("DATA E HORA DA EMISSÃO DA NFS-e", fmtDataHora(d.dataEmissaoNfse)))}
    ${tr(campo("NÚMERO DA DPS", d.numeroDps) + campo("SÉRIE DA DPS", d.serieDps) + campo("DATA E HORA DA EMISSÃO DA DPS", fmtDataHora(d.dataEmissaoDps)))}

    ${tr(sec("EMITENTE DA NFS-e", "Prestador") + campo("SITUAÇÃO DA NFS-e", "NFS-e Gerada") + campo("FINALIDADE", D, 2))}
    ${tr(sec("PRESTADOR / FORNECEDOR") + campo("CNPJ / CPF / NIF", fmtDoc(d.prestador.documento)) + campo("Indicador Municipal (Inscrição)", D) + campo("Telefone", fmtTel(d.prestador.telefone)))}
    ${tr(campo("Nome / Nome Empresarial", d.prestador.nome, 2) + campo("Município / Sigla UF", munUf(d.prestador.endereco)) + campo("Código IBGE / CEP", `${fmtIbge(d.prestador.endereco.codigoIbge)} / ${fmtCep(d.prestador.endereco.cep)}`))}
    ${tr(campo("Endereço", endLinha(d.prestador.endereco), 2) + campo("E-mail", d.prestador.email || D, 2))}
    ${tr(campo("Simples Nacional na Data de Competência", d.prestador.optanteSN, 2) + campo("Regime de Apuração Tributária pelo SN", d.prestador.regimeApuracaoSN, 2))}

    ${tr(sec("TOMADOR / ADQUIRENTE") + campo("CNPJ / CPF / NIF", fmtDoc(d.tomador.documento)) + campo("Indicador Municipal (Inscrição)", D) + campo("Telefone", D))}
    ${tr(campo("Nome / Nome Empresarial", d.tomador.nome, 2) + campo("Município / Sigla UF", munUf(d.tomador.endereco)) + campo("Código IBGE / CEP", `${fmtIbge(d.tomador.endereco.codigoIbge)} / ${fmtCep(d.tomador.endereco.cep)}`))}
    ${tr(campo("Endereço", endLinha(d.tomador.endereco), 2) + campo("E-mail", d.tomador.email || D, 2))}
    ${tr(`<td colspan="4" class="center">DESTINATÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</td>`)}
    ${tr(`<td colspan="4" class="center">INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e</td>`)}

    ${tr(sec("SERVIÇO PRESTADO") + campo("Código de Tributação Nacional/Municipal", `${d.servico.codigoNac} / ${d.servico.codigoMun || D}`) + campo("Código da NBS", D) + campo("Local da Prestação / Sigla UF / País", `${d.localPrestacao || D} / ${d.ufEmitente || D} / -`))}
    ${tr(`<td colspan="4"><div class="val">${esc(d.servico.descricaoNacional || D)}</div></td>`)}
    ${tr(campo("Descrição do Serviço", d.servico.descricao, 4))}

    ${tr(sec("TRIBUTAÇÃO MUNICIPAL (ISSQN)") + campo("Tipo de Tributação do ISSQN", d.issqn.tributacao) + campo("Município / Sigla UF / País de Incidência do ISSQN", `${d.municipioIncidencia || D} / ${d.ufEmitente || D} / -`, 2))}
    ${tr(campo("BC ISSQN", D) + campo("Alíquota Aplicada", D) + campo("Retenção do ISSQN", d.issqn.retencao) + campo("ISSQN Apurado", D))}

    ${tr(sec("TRIBUTAÇÃO FEDERAL (EXCETO CBS)") + campo("IRRF", D) + campo("Contribuição Previdenciária - Retida", D) + campo("Contribuições Sociais - Retidas", D))}
    ${tr(campo("PIS - Débito Apuração Própria", D) + campo("COFINS - Débito Apuração Própria", D) + campo("Descrição Contrib. Sociais - Retidas", D, 2))}

    ${tr(sec("TRIBUTAÇÃO IBS/CBS") + campo("CST / cClassTrib", `${D} / ${D}`) + campo("Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF", `${D} / ${D} / ${D} / ${D}`, 2))}
    ${tr(campo("Exclusões e Reduções da Base de Cálculo", Z) + campo("Base de Cálculo Após Exclusões e Reduções", D) + campo("Red. Alíquota IBS / Red. Alíquota CBS", `${D} / ${D} / ${D}`) + campo("Alíquota - IBS UF / IBS Mun", `${D} / ${D}`))}
    ${tr(campo("Alíq. Efetiva Municipal - IBS", D) + campo("Valor Apurado Municipal - IBS", D) + campo("Alíq. Efetiva Estadual - IBS", D) + campo("Valor Apurado Estadual - IBS", D))}
    ${tr(campo("Valor Total Apurado - IBS", D) + campo("Alíquota - CBS", D) + campo("Alíquota Efetiva - CBS", D) + campo("Valor Total Apurado - CBS", D))}

    ${tr(sec("VALOR TOTAL DA NFS-e") + campo("VALOR DA OPERAÇÃO / SERVIÇO", fmtMoeda(d.valores.servico)) + campo("Desconto Incondicionado", D) + campo("Desconto Condicionado", D))}
    ${tr(campo("Total das Retenções (ISSQN / Federais)", D) + campo("VALOR LÍQUIDO DA NFS-e", fmtMoeda(d.valores.liquido)) + campo("Total do IBS/CBS", Z) + campo("VALOR LÍQUIDO DA NFS-e + IBS/CBS", Z))}

    ${tr(sec("INFORMAÇÕES COMPLEMENTARES", undefined, 4))}
    ${tr(`<td colspan="4" style="height:34px"><div class="val">Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: ${d.valores.aliqAproxTrib != null ? fmtMoeda((d.valores.servico * d.valores.aliqAproxTrib) / 100) : D}; Estaduais: -; Municipais: -;</div></td>`)}
  </table>

  <table class="foot">
    ${tr(`<td style="width:30%">Data Cientificação:</td><td style="width:30%">Identificação e Assinatura</td><td style="width:40%">N° NFS-e / Chave NFS-e<div class="rod">${esc(d.numero)} / ${esc(d.chave)}</div></td>`)}
  </table>

</body></html>`;
}
