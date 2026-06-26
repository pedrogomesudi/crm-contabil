import * as CFB from "cfb";

export type CelulaXls = string | number | null;
export type FolhaXls = { nome: string; celulas: CelulaXls[][] };

type Registro = { tipo: number; dados: Buffer };
type FolhaInterna = { nome: string; m: Map<number, Map<number, CelulaXls>> };

function lerRegistros(buf: Buffer): Registro[] {
  const out: Registro[] = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    const tipo = buf.readUInt16LE(i);
    const len = buf.readUInt16LE(i + 2);
    i += 4;
    if (i + len > buf.length) break; // registro truncado: para em vez de ler lixo
    out.push({ tipo, dados: buf.subarray(i, i + len) });
    i += len;
  }
  return out;
}

// SST com tratamento de CONTINUE (re-leitura do flag de codificação na borda).
function parseSST(payload: Buffer, continues: Buffer[]): string[] {
  const chunks = [payload, ...continues];
  let ci = 0;
  let off = 0;
  const garante = () => {
    while (ci < chunks.length && off >= (chunks[ci]?.length ?? 0)) {
      ci++;
      off = 0;
    }
    return ci < chunks.length;
  };
  const rd = (k: number): Buffer => {
    const parts: Buffer[] = [];
    while (k > 0 && garante()) {
      const chunk = chunks[ci];
      if (!chunk) break;
      const take = Math.min(k, chunk.length - off);
      parts.push(chunk.subarray(off, off + take));
      off += take;
      k -= take;
    }
    return Buffer.concat(parts);
  };
  const cab = rd(8); // cstTotal / cstUnique
  const unique = cab.length >= 8 ? Math.max(0, cab.readInt32LE(4)) : 0;
  const strings: string[] = [];
  for (let n = 0; n < unique; n++) {
    if (!garante()) break;
    const cch = rd(2).readUInt16LE(0);
    const grbit = rd(1)[0] ?? 0;
    const rich = grbit & 0x08 ? rd(2).readUInt16LE(0) : 0;
    const ext = grbit & 0x04 ? rd(4).readInt32LE(0) : 0;
    let high = grbit & 0x01;
    let restante = cch;
    const pedacos: string[] = [];
    while (restante > 0) {
      if (!garante()) break;
      if (off === 0 && ci !== 0) high = (rd(1)[0] ?? 0) & 0x01; // borda de CONTINUE: novo flag
      if (high) {
        const b = rd(2);
        if (b.length < 2) break;
        pedacos.push(b.toString("utf16le"));
      } else {
        const b = rd(1);
        if (b.length < 1) break;
        pedacos.push(b.toString("latin1"));
      }
      restante--;
    }
    if (rich) rd(4 * rich);
    if (ext) rd(ext);
    strings.push(pedacos.join(""));
  }
  return strings;
}

function rkParaNumero(rk: number): number {
  const centavos = rk & 0x01;
  const inteiro = rk & 0x02;
  const base = rk & 0xfffffffc;
  let num: number;
  if (inteiro) {
    num = base >> 2;
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE(base >>> 0, 4);
    num = b.readDoubleLE(0);
  }
  return centavos ? num / 100 : num;
}

export function parseBiff(workbook: Buffer): FolhaXls[] {
  const recs = lerRegistros(workbook);
  let sst: string[] = [];
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    if (rec && rec.tipo === 0x00fc) {
      const conts: Buffer[] = [];
      let j = i + 1;
      while (j < recs.length) {
        const r = recs[j];
        if (!r || r.tipo !== 0x003c) break;
        conts.push(r.dados);
        j++;
      }
      sst = parseSST(rec.dados, conts);
      break;
    }
  }
  const folhas: FolhaInterna[] = [];
  let atual: Map<number, Map<number, CelulaXls>> | null = null;
  const set = (r: number, c: number, v: CelulaXls) => {
    if (!atual) return;
    if (!atual.has(r)) atual.set(r, new Map());
    atual.get(r)!.set(c, v);
  };
  for (const { tipo, dados: d } of recs) {
    if (tipo === 0x0809) {
      const dt = d.length >= 4 ? d.readUInt16LE(2) : 0;
      if (dt === 0x0010) {
        atual = new Map();
        folhas.push({ nome: `Folha${folhas.length + 1}`, m: atual });
      }
      continue;
    }
    if (!atual) continue;
    if (tipo === 0x00fd && d.length >= 10) {
      set(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readInt32LE(6)] ?? "");
    } else if (tipo === 0x0204 && d.length >= 9) {
      // LABEL (string inline)
      const r = d.readUInt16LE(0);
      const c = d.readUInt16LE(2);
      const cch = d.readUInt16LE(6);
      const g = d[8] ?? 0;
      const fim = g & 1 ? 9 + 2 * cch : 9 + cch;
      if (fim <= d.length) {
        set(r, c, g & 1 ? d.subarray(9, fim).toString("utf16le") : d.subarray(9, fim).toString("latin1"));
      }
    } else if (tipo === 0x027e && d.length >= 10) {
      set(d.readUInt16LE(0), d.readUInt16LE(2), rkParaNumero(d.readUInt32LE(6)));
    } else if (tipo === 0x0203 && d.length >= 14) {
      set(d.readUInt16LE(0), d.readUInt16LE(2), d.readDoubleLE(6));
    } else if (tipo === 0x00bd && d.length >= 6) {
      // MULRK: [row][colFirst]{[ixfe][rk]}*[colLast]
      const r = d.readUInt16LE(0);
      const cf = d.readUInt16LE(2);
      const cl = d.readUInt16LE(d.length - 2);
      let p = 4;
      for (let c = cf; c <= cl && p + 6 <= d.length - 2; c++) {
        set(r, c, rkParaNumero(d.readUInt32LE(p + 2)));
        p += 6;
      }
    }
  }
  // materializa o Map -> matriz densa
  return folhas.map((f) => {
    const maxR = Math.max(-1, ...f.m.keys());
    let maxC = -1;
    for (const linha of f.m.values()) maxC = Math.max(maxC, ...linha.keys());
    const celulas: CelulaXls[][] = [];
    for (let r = 0; r <= maxR; r++) {
      const linha: CelulaXls[] = [];
      const lm = f.m.get(r);
      for (let c = 0; c <= maxC; c++) linha.push(lm?.get(c) ?? null);
      celulas.push(linha);
    }
    return { nome: f.nome, celulas };
  });
}

export function lerXls(arquivo: Buffer): FolhaXls[] {
  const cfb = CFB.read(arquivo, { type: "buffer" });
  const entry = CFB.find(cfb, "Workbook") || CFB.find(cfb, "Book");
  if (!entry || !entry.content) throw new Error("Arquivo .xls inválido: stream Workbook não encontrado");
  const content = entry.content as Uint8Array;
  return parseBiff(Buffer.from(content));
}
