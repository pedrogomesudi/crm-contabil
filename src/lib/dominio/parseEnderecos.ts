import type { CelulaXls, FolhaXls } from "./biff";

// Extrai CNPJ + endereço do relatório "Empresas — Dados Cadastrais" do Domínio
// (layout ficha rótulo→valor, um bloco por empresa iniciado por "Código:"). É um
// relatório DIFERENTE do "Clientes": aqui o documento vem em "CNPJ/CPF/CEI/CAEPF:"
// e os campos de endereço em rótulos na col 0 com o valor por volta da col 4.

export type EnderecoDominio = {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  pais?: string;
};
export type EnderecoImportado = { cnpj: string; endereco: EnderecoDominio };

// Valor de um rótulo na linha (col 0), procurando a 1ª célula não-vazia à direita.
function valorRotulo(bloco: CelulaXls[][], rotulo: string): string | null {
  for (const l of bloco) {
    if (String(l[0] ?? "").trim() === rotulo) {
      for (let c = 1; c <= 6; c++) {
        const v = String(l[c] ?? "").trim();
        if (v) return v;
      }
    }
  }
  return null;
}

export function parseEnderecos(folha: FolhaXls): EnderecoImportado[] {
  // Agrupa linhas em blocos iniciados por "Código:" (um por empresa).
  const blocos: CelulaXls[][][] = [];
  let atual: CelulaXls[][] | null = null;
  for (const l of folha.celulas) {
    if (String(l[0] ?? "").trim() === "Código:") {
      if (atual) blocos.push(atual);
      atual = [];
    }
    if (atual) atual.push(l);
  }
  if (atual) blocos.push(atual);

  const out: EnderecoImportado[] = [];
  for (const bloco of blocos) {
    const cnpj = (valorRotulo(bloco, "CNPJ/CPF/CEI/CAEPF:") ?? "").replace(/\D/g, "");
    if (cnpj.length < 11) continue;
    const end: EnderecoDominio = {};
    const set = (k: keyof EnderecoDominio, rotulo: string) => {
      const v = valorRotulo(bloco, rotulo);
      if (v) end[k] = v;
    };
    set("logradouro", "Endereço:");
    set("numero", "Número:");
    set("complemento", "Complemento:");
    set("bairro", "Bairro:");
    set("cidade", "Município:");
    set("uf", "UF:");
    set("cep", "CEP:");
    set("pais", "País:");
    if (Object.keys(end).length === 0) continue;
    out.push({ cnpj, endereco: end });
  }
  return out;
}
