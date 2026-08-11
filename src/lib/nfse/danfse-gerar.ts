import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import QRCode from "qrcode";
import type { DadosDanfse, EnderecoDanfse } from "./danfse-parse";

// Desenha o DANFSe (documento auxiliar da NFS-e) em PDF a partir dos dados do XML autorizado.
// Não substitui a nota (o XML é o documento fiscal) — é a representação para envio/impressão,
// com os mesmos dados e o QR Code de consulta pública pela chave.

// Consulta pública nacional pela chave de acesso (conteúdo do QR Code).
const urlConsulta = (chave: string) => `https://www.nfse.gov.br/consultapublica?tpc=1&chNFSe=${chave}`;

// Helvetica (WinAnsi) cobre o pt-BR; troca o que estiver fora para não quebrar o encode.
const limpar = (t: string) =>
  t
    .replace(/[^\x20-\x7E -ÿ]/g, "?")
    .replace(/\s+/g, " ")
    .trim();

const fmtDoc = (d: string) => {
  const x = d.replace(/\D/g, "");
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return d;
};
const fmtCep = (c: string) => {
  const x = c.replace(/\D/g, "");
  return x.length === 8 ? x.replace(/^(\d{5})(\d{3})$/, "$1-$2") : c;
};
const fmtMoeda = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtData = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};
const fmtChave = (c: string) => c.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
const linhaEndereco = (e: EnderecoDanfse) =>
  limpar(
    [
      [e.logradouro, e.numero].filter(Boolean).join(", "),
      e.bairro,
      e.municipio && e.uf ? `${e.municipio}/${e.uf}` : e.municipio,
      e.cep ? `CEP ${fmtCep(e.cep)}` : "",
    ]
      .filter(Boolean)
      .join(" · "),
  );

const CINZA = rgb(0.42, 0.46, 0.51);
const TINTA = rgb(0.1, 0.13, 0.16);
const LINHA = rgb(0.85, 0.87, 0.9);
const VERDE = rgb(0.06, 0.5, 0.34);

export async function gerarDanfsePdf(d: DadosDanfse): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const M = 40; // margem
  const W = 595.28 - M * 2;
  let y = 800;

  const txt = (t: string, x: number, yy: number, size: number, font: PDFFont = reg, color = TINTA) =>
    page.drawText(limpar(t), { x, y: yy, size, font, color });
  const rotulo = (t: string, x: number, yy: number) => txt(t.toUpperCase(), x, yy, 6.5, bold, CINZA);

  // Cabeçalho
  txt("DANFSe", M, y, 20, bold);
  txt("Documento Auxiliar da NFS-e", M + 92, y + 2, 10, reg, CINZA);
  txt("Nota Fiscal de Serviço eletrônica — Padrão Nacional", M + 92, y - 9, 8, reg, CINZA);
  if (!d.producao) txt("AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL", M, y - 24, 9, bold, rgb(0.7, 0.4, 0));
  y -= 40;

  // Faixa: número + competência + emissão + DFe
  const faixa = (rot: string, val: string, x: number) => {
    rotulo(rot, x, y);
    txt(val, x, y - 13, 11, bold);
  };
  page.drawRectangle({ x: M, y: y - 20, width: W, height: 34, borderColor: LINHA, borderWidth: 1 });
  faixa("Número da NFS-e", d.numero || "—", M + 8);
  faixa("Competência", d.competencia ? fmtData(d.competencia) : "—", M + 150);
  faixa("Emissão", d.dataEmissao ? fmtData(d.dataEmissao) : "—", M + 270);
  faixa("DFe nº", d.dfe || "—", M + 380);
  y -= 34;

  // QR Code (canto superior direito, dentro da faixa de chave)
  let qrImg = null;
  try {
    const png = await QRCode.toBuffer(urlConsulta(d.chave), { margin: 0, width: 220, errorCorrectionLevel: "M" });
    qrImg = await pdf.embedPng(png);
  } catch {
    qrImg = null;
  }

  // Chave de acesso
  page.drawRectangle({
    x: M,
    y: y - 30,
    width: W,
    height: 26,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: LINHA,
    borderWidth: 1,
  });
  rotulo("Chave de acesso da NFS-e", M + 8, y - 8);
  txt(fmtChave(d.chave), M + 8, y - 22, 10, bold);
  y -= 46;

  // Blocos Prestador / Tomador
  const bloco = (titulo: string, nome: string, docc: string, end: EnderecoDanfse, extra: string, yTopo: number) => {
    const h = 74;
    page.drawRectangle({ x: M, y: yTopo - h, width: W, height: h, borderColor: LINHA, borderWidth: 1 });
    txt(titulo, M + 8, yTopo - 14, 8, bold, VERDE);
    txt(nome || "—", M + 8, yTopo - 30, 11, bold);
    rotulo("CNPJ/CPF", M + 8, yTopo - 44);
    txt(fmtDoc(docc) || "—", M + 60, yTopo - 44, 9);
    txt(linhaEndereco(end) || "—", M + 8, yTopo - 58, 8, reg, CINZA);
    if (extra) txt(extra, M + 8, yTopo - 68, 8, reg, CINZA);
    return yTopo - h - 10;
  };
  y = bloco(
    "PRESTADOR DE SERVIÇOS",
    d.prestador.nome,
    d.prestador.cnpj,
    d.prestador.endereco,
    `Local da prestação: ${limpar(d.localPrestacao) || "—"}`,
    y,
  );
  y = bloco(
    "TOMADOR DE SERVIÇOS",
    d.tomador.nome,
    d.tomador.documento,
    d.tomador.endereco,
    d.tomador.email ? `E-mail: ${limpar(d.tomador.email)}` : "",
    y,
  );

  // Serviço
  const hs = 62;
  page.drawRectangle({ x: M, y: y - hs, width: W, height: hs, borderColor: LINHA, borderWidth: 1 });
  txt("DISCRIMINAÇÃO DOS SERVIÇOS", M + 8, y - 14, 8, bold, VERDE);
  rotulo("Código de tributação nacional", M + 8, y - 28);
  txt(d.servico.codigo || "—", M + 8, y - 39, 9);
  txt(limpar(d.servico.descricaoNacional || d.servico.descricao), M + 150, y - 39, 8, reg, CINZA);
  rotulo("Descrição", M + 8, y - 51);
  txt(d.servico.descricao || "—", M + 60, y - 51, 9);
  y -= hs + 10;

  // Valores
  const hv = 46;
  page.drawRectangle({
    x: M,
    y: y - hv,
    width: W,
    height: hv,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: LINHA,
    borderWidth: 1,
  });
  rotulo("Valor do serviço", M + 8, y - 14);
  txt(fmtMoeda(d.valores.servico), M + 8, y - 30, 12, bold);
  rotulo("Valor líquido", M + 200, y - 14);
  txt(fmtMoeda(d.valores.liquido), M + 200, y - 30, 12, bold, VERDE);
  if (d.valores.aliqAproxTrib != null) {
    rotulo("Trib. aprox. (Simples)", M + 360, y - 14);
    txt(`${d.valores.aliqAproxTrib.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`, M + 360, y - 30, 10, bold);
  }
  y -= hv + 16;

  // QR + rodapé de autenticidade
  if (qrImg) page.drawImage(qrImg, { x: 595.28 - M - 92, y: y - 92, width: 92, height: 92 });
  rotulo("Autenticidade", M, y - 10);
  txt("Consulte a NFS-e pela chave de acesso em", M, y - 24, 9, reg, CINZA);
  txt("www.nfse.gov.br", M, y - 36, 9, bold, VERDE);
  txt("(aponte a câmera para o QR Code ao lado)", M, y - 50, 8, reg, CINZA);

  // Rodapé
  txt(
    "DANFSe gerado pelo SALDO a partir do XML autorizado. O documento fiscal é a NFS-e (XML).",
    M,
    40,
    7.5,
    reg,
    CINZA,
  );

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
