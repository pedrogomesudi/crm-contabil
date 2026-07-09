export type MovimentoBruto = { data: string; valor: number; descricao: string; fitid: string | null };
export type MapaCSV = { data: string; valor: string; descricao: string };

const tagOFX = (bloco: string, nome: string): string | null => {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1]!.trim() : null;
};

export function parsearOFX(texto: string): MovimentoBruto[] {
  const out: MovimentoBruto[] = [];
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)) {
    const b = m[1]!;
    const dt = tagOFX(b, "DTPOSTED");
    const amt = tagOFX(b, "TRNAMT");
    if (!dt || dt.length < 8 || !amt) continue;
    const valor = Number(amt.replace(",", "."));
    if (!Number.isFinite(valor)) continue;
    out.push({
      data: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
      valor,
      descricao: (tagOFX(b, "MEMO") ?? tagOFX(b, "NAME") ?? "").trim(),
      fitid: tagOFX(b, "FITID"),
    });
  }
  return out;
}

function delimitador(texto: string): string {
  const primeira = texto.split(/\r?\n/)[0] ?? "";
  return primeira.split(";").length > primeira.split(",").length ? ";" : ",";
}
const limpar = (s: string) => s.trim().replace(/^"|"$/g, "");

export function cabecalhosCSV(texto: string): string[] {
  const d = delimitador(texto);
  return (texto.split(/\r?\n/)[0] ?? "").split(d).map(limpar);
}

function dataBRparaISO(s: string): string | null {
  const br = s.trim().match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

function valorBR(s: string): number | null {
  let t = s.trim().replace(/[R$\s]/gi, "");
  let neg = false;
  if (/^\(.*\)$/.test(t)) {
    neg = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    neg = true;
    t = t.slice(1);
  }
  if (t.startsWith("+")) t = t.slice(1);
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const v = Number(t);
  if (!Number.isFinite(v) || t === "") return null;
  return neg ? -v : v;
}

export function parsearCSV(texto: string, mapa: MapaCSV): MovimentoBruto[] {
  const d = delimitador(texto);
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return [];
  const cab = linhas[0]!.split(d).map(limpar);
  const iData = cab.indexOf(mapa.data);
  const iValor = cab.indexOf(mapa.valor);
  const iDesc = cab.indexOf(mapa.descricao);
  if (iData < 0 || iValor < 0) return [];
  const out: MovimentoBruto[] = [];
  for (const linha of linhas.slice(1)) {
    const cols = linha.split(d).map(limpar);
    const data = dataBRparaISO(cols[iData] ?? "");
    const valor = valorBR(cols[iValor] ?? "");
    if (!data || valor === null) continue;
    out.push({ data, valor, descricao: iDesc >= 0 ? (cols[iDesc] ?? "").trim() : "", fitid: null });
  }
  return out;
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function dedupHash(m: MovimentoBruto): string {
  if (m.fitid) return m.fitid;
  return "h" + fnv1a(`${m.data}|${m.valor.toFixed(2)}|${m.descricao.trim().toLowerCase()}`);
}
