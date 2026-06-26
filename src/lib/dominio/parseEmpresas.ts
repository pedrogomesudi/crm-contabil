import type { FolhaXls } from "./biff";
import type { EmpresaDominio } from "./tipos";
import { soDigitos } from "./tipos";

const txt = (v: unknown): string => String(v ?? "").trim();
const ou = (s: string): string | null => (s ? s : null);

export function parseEmpresas(folha: FolhaXls): EmpresaDominio[] {
  const out: EmpresaDominio[] = [];
  for (const linha of folha.celulas) {
    const cod = linha[0];
    if (typeof cod !== "number") continue; // pula cabeçalho/rodapé
    const cnpj = soDigitos(linha[2]);
    if (cnpj.length !== 14) continue;
    out.push({
      codigo: cod,
      razaoSocial: txt(linha[1]),
      cnpj,
      status: txt(linha[3]),
      cnae: ou(txt(linha[4])),
      regimeDominio: txt(linha[5]),
      inscricaoEstadual: ou(soDigitos(linha[8])),
    });
  }
  return out;
}
