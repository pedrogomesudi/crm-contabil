import type { CelulaXls, FolhaXls } from "./biff";
import type { ContatoDominio, EnderecoDominio } from "./tipos";
import { soDigitos } from "@/lib/format";

type Linha = CelulaXls[];

// Valor imediatamente à direita de um rótulo (col 0 ou col 5), na mesma linha.
function valorDoRotulo(linha: Linha, rotulo: string): string | null {
  for (const base of [0, 5]) {
    if (String(linha[base] ?? "").trim() === rotulo) {
      for (let c = base + 1; c < base + 5; c++) {
        const v = String(linha[c] ?? "").trim();
        if (v) return v;
      }
    }
  }
  return null;
}
function buscar(bloco: Linha[], rotulo: string): string | null {
  for (const l of bloco) {
    const v = valorDoRotulo(l, rotulo);
    if (v != null) return v;
  }
  return null;
}
function montarEndereco(bloco: Linha[]): EnderecoDominio | null {
  const tipoLog = buscar(bloco, "Endereço:");
  let nomeLog: string | null = null;
  for (const l of bloco) {
    if (String(l[0] ?? "").trim() === "Endereço:") {
      const v = String(l[3] ?? "").trim();
      if (v) {
        nomeLog = v;
        break;
      }
    }
  }
  const e: EnderecoDominio = {};
  const log = [tipoLog, nomeLog].filter(Boolean).join(" ").trim();
  if (log) e.logradouro = log;
  const num = buscar(bloco, "Número:");
  if (num) e.numero = num;
  const comp = buscar(bloco, "Complemento:");
  if (comp) e.complemento = comp;
  const bairro = buscar(bloco, "Bairro:");
  if (bairro) e.bairro = bairro;
  const cidade = buscar(bloco, "Município:");
  if (cidade) e.cidade = cidade;
  const uf = buscar(bloco, "UF:");
  if (uf) e.uf = uf;
  const cep = buscar(bloco, "CEP:");
  if (cep) e.cep = cep;
  const pais = buscar(bloco, "País:");
  if (pais) e.pais = pais;
  return Object.keys(e).length ? e : null;
}

export function parseClientes(folha: FolhaXls): ContatoDominio[] {
  // agrupa linhas em blocos iniciados por "Código:"
  const blocos: Linha[][] = [];
  let atual: Linha[] | null = null;
  for (const l of folha.celulas) {
    if (String(l[0] ?? "").trim() === "Código:") {
      if (atual) blocos.push(atual);
      atual = [];
    }
    if (atual) atual.push(l);
  }
  if (atual) blocos.push(atual);

  const out: ContatoDominio[] = [];
  for (const bloco of blocos) {
    const primeira = bloco[0];
    if (!primeira) continue;
    const codStr = valorDoRotulo(primeira, "Código:");
    // "Código:" presente mas sem valor (ex.: cabeçalho de página) => Number(null)
    // seria 0 e criaria uma ficha fantasma. Exige um número de verdade.
    if (codStr === null) continue;
    const codigo = Number(codStr);
    if (!Number.isFinite(codigo)) continue;
    const docDigitos = soDigitos(buscar(bloco, "Inscrição:") ?? "");
    out.push({
      codigo,
      nome: buscar(bloco, "Nome:") ?? "",
      apelido: buscar(bloco, "Apelido:"),
      cnpj: docDigitos.length >= 11 ? docDigitos : null,
      endereco: montarEndereco(bloco),
      email: buscar(bloco, "E-mail:"),
      telefone: buscar(bloco, "Telefone:") ?? buscar(bloco, "Celular:"),
    });
  }
  return out;
}
