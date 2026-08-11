import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import type { DadosDanfse, EnderecoDanfse } from "./danfse-parse";

// Desenha o DANFSe (documento auxiliar da NFS-e) em PDF seguindo o layout oficial nacional,
// a partir dos dados do XML autorizado. Não substitui a nota (o XML é o documento fiscal) —
// é a representação para envio/impressão, com o QR Code de consulta pública pela chave.

const urlConsulta = (chave: string) => `https://www.nfse.gov.br/consultapublica?tpc=1&chNFSe=${chave}`;
const D = "-"; // campo não informado

const limpar = (t: string) =>
  t
    .replace(/[^\x20-\x7E -ÿ]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
const fmtDoc = (d: string) => {
  const x = d.replace(/\D/g, "");
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d || D;
};
const fmtCep = (c: string) => {
  const x = c.replace(/\D/g, "");
  return x.length === 8 ? x.replace(/^(\d{5})(\d{3})$/, "$1-$2") : c;
};
const fmtMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDataHora = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : fmtData(iso);
};
const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso || D;
};
const linhaEndereco = (e: EnderecoDanfse) =>
  [[e.logradouro, e.numero].filter(Boolean).join(", "), e.bairro].filter(Boolean).join(", ") || D;

const TINTA = rgb(0.1, 0.13, 0.16);
const CINZA = rgb(0.42, 0.46, 0.51);
const LINHA = rgb(0.8, 0.82, 0.85);
const BARRA = rgb(0.2, 0.24, 0.29);

export async function gerarDanfsePdf(d: DadosDanfse): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page: PDFPage = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 28;
  const W = 595.28 - M * 2;
  let y = 812;

  const txt = (t: string, x: number, yy: number, size: number, font: PDFFont = reg, color = TINTA) =>
    page.drawText(limpar(t), { x, y: yy, size, font, color });

  // Barra de seção (fundo escuro, texto branco).
  const secao = (titulo: string): void => {
    page.drawRectangle({ x: M, y: y - 15, width: W, height: 15, color: BARRA });
    txt(titulo, M + 5, y - 11, 7.5, bold, rgb(1, 1, 1));
    y -= 15;
  };
  // Uma linha de campos (rótulo em cima, valor embaixo), em colunas de larguras proporcionais.
  const linha = (campos: { r: string; v: string; flex?: number }[], h = 26): void => {
    const total = campos.reduce((s, c) => s + (c.flex ?? 1), 0);
    let x = M;
    page.drawRectangle({ x: M, y: y - h, width: W, height: h, borderColor: LINHA, borderWidth: 0.5 });
    for (const c of campos) {
      const w = (W * (c.flex ?? 1)) / total;
      txt(c.r.toUpperCase(), x + 5, y - 9, 5.5, reg, CINZA);
      txt(c.v || D, x + 5, y - 20, 8, bold);
      x += w;
      if (x < M + W - 1) page.drawLine({ start: { x, y: y - h }, end: { x, y }, thickness: 0.5, color: LINHA });
    }
    y -= h;
  };

  // ===== Cabeçalho =====
  page.drawRectangle({ x: M, y: y - 62, width: W, height: 62, borderColor: LINHA, borderWidth: 0.8 });
  txt("DANFSe", M + 8, y - 20, 17, bold);
  txt("v1.0", M + 78, y - 20, 9, reg, CINZA);
  txt("Documento Auxiliar da NFS-e", M + 8, y - 33, 9, reg, CINZA);
  txt(`Prefeitura Municipal de ${limpar(d.localEmissao) || D}`, M + 8, y - 48, 8.5, bold);
  if (!d.producao) txt("AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL", M + 8, y - 58, 7.5, bold, rgb(0.7, 0.35, 0));

  // QR + chave (à direita)
  let qrImg = null;
  try {
    const png = await QRCode.toBuffer(urlConsulta(d.chave), { margin: 0, width: 200, errorCorrectionLevel: "M" });
    qrImg = await pdf.embedPng(png);
  } catch {
    qrImg = null;
  }
  if (qrImg) page.drawImage(qrImg, { x: M + W - 58, y: y - 58, width: 50, height: 50 });
  txt("CHAVE DE ACESSO DA NFS-e", M + 200, y - 12, 5.5, reg, CINZA);
  txt(d.chave, M + 200, y - 23, 7.7, bold);
  txt("Verifique a autenticidade pela leitura do QR Code", M + 200, y - 35, 6.5, reg, CINZA);
  txt("ou pela chave no portal nacional da NFS-e.", M + 200, y - 44, 6.5, reg, CINZA);
  y -= 62;

  // ===== Faixa de identificação =====
  linha([
    { r: "Número da NFS-e", v: d.numero },
    { r: "Competência", v: fmtData(d.competencia) },
    { r: "Emissão da NFS-e", v: fmtDataHora(d.dataEmissaoNfse), flex: 1.3 },
    { r: "Número da DPS", v: d.numeroDps },
    { r: "Série", v: d.serieDps, flex: 0.6 },
    { r: "Emissão da DPS", v: fmtDataHora(d.dataEmissaoDps), flex: 1.3 },
  ]);

  // ===== Prestador =====
  secao("EMITENTE DA NFS-e — PRESTADOR DO SERVIÇO");
  linha([
    { r: "CNPJ / CPF / NIF", v: fmtDoc(d.prestador.documento), flex: 1.3 },
    { r: "Inscrição Municipal", v: D },
    { r: "Telefone", v: D },
  ]);
  linha([
    { r: "Nome / Nome Empresarial", v: d.prestador.nome, flex: 2 },
    { r: "E-mail", v: d.prestador.email || D, flex: 1.3 },
  ]);
  linha([
    { r: "Endereço", v: linhaEndereco(d.prestador.endereco), flex: 2 },
    { r: "Município", v: `${d.prestador.endereco.municipio} - ${d.prestador.endereco.uf}` },
    { r: "CEP", v: fmtCep(d.prestador.endereco.cep), flex: 0.7 },
  ]);
  linha([
    { r: "Optante Simples Nacional (na competência)", v: d.prestador.optanteSN, flex: 1.4 },
    { r: "Regime de Apuração", v: d.prestador.regimeApuracaoSN, flex: 2 },
  ]);

  // ===== Tomador =====
  secao("TOMADOR DO SERVIÇO");
  linha([
    { r: "CNPJ / CPF / NIF", v: fmtDoc(d.tomador.documento), flex: 1.3 },
    { r: "Inscrição Municipal", v: D },
    { r: "Telefone", v: D },
  ]);
  linha([
    { r: "Nome / Nome Empresarial", v: d.tomador.nome, flex: 2 },
    { r: "E-mail", v: d.tomador.email || D, flex: 1.3 },
  ]);
  linha([
    { r: "Endereço", v: linhaEndereco(d.tomador.endereco), flex: 2 },
    { r: "Município", v: `${d.tomador.endereco.municipio} - ${d.tomador.endereco.uf}` },
    { r: "CEP", v: fmtCep(d.tomador.endereco.cep), flex: 0.7 },
  ]);

  // ===== Intermediário =====
  secao("INTERMEDIÁRIO DO SERVIÇO");
  linha([{ r: " ", v: "NÃO IDENTIFICADO NA NFS-e" }], 18);

  // ===== Serviço =====
  secao("SERVIÇO PRESTADO");
  linha([
    {
      r: "Código de Tributação Nacional",
      v: `${d.servico.codigoNac} — ${limpar(d.servico.descricaoNacional)}`,
      flex: 2.4,
    },
    { r: "Cód. Trib. Municipal", v: d.servico.codigoMun || D },
    { r: "Local da Prestação", v: `${d.localPrestacao || D}`, flex: 1.2 },
  ]);
  linha([{ r: "Descrição do Serviço", v: d.servico.descricao }], 26);

  // ===== Tributação municipal =====
  secao("TRIBUTAÇÃO MUNICIPAL");
  linha([
    { r: "Tributação do ISSQN", v: d.issqn.tributacao, flex: 1.2 },
    { r: "Município de Incidência", v: `${d.municipioIncidencia || D}`, flex: 1.2 },
    { r: "Regime Especial", v: d.issqn.regimeEspecial },
    { r: "Retenção do ISSQN", v: d.issqn.retencao },
  ]);

  // ===== Valor total =====
  secao("VALOR TOTAL DA NFS-e");
  linha(
    [
      { r: "Valor do Serviço", v: fmtMoeda(d.valores.servico) },
      { r: "Descontos", v: D },
      { r: "ISSQN Retido", v: D },
      { r: "Retenções Federais", v: D },
      { r: "Valor Líquido da NFS-e", v: fmtMoeda(d.valores.liquido), flex: 1.2 },
    ],
    30,
  );

  // ===== Totais aproximados dos tributos =====
  secao("TOTAIS APROXIMADOS DOS TRIBUTOS (Lei 12.741/2012)");
  const trib = d.valores.aliqAproxTrib;
  const vTrib = trib != null ? fmtMoeda((d.valores.servico * trib) / 100) : D;
  linha([
    { r: "Federais", v: D },
    { r: "Estaduais", v: D },
    {
      r: `Municipais${trib != null ? ` (aprox. ${trib.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%)` : ""}`,
      v: vTrib,
    },
  ]);

  // ===== Informações complementares =====
  secao("INFORMAÇÕES COMPLEMENTARES");
  linha([{ r: " ", v: `DFe nº ${d.dfe || D}` }], 18);

  // Rodapé
  txt(
    "DANFSe gerado pelo SALDO a partir do XML autorizado da NFS-e. O documento fiscal é a NFS-e (XML). Consulte em www.nfse.gov.br.",
    M,
    28,
    6.8,
    reg,
    CINZA,
  );

  return Buffer.from(await pdf.save());
}
