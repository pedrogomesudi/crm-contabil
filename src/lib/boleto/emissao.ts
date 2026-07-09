import type { DadosEmissao } from "./tipos";

export function dadosEmissaoDeTitulo(
  titulo: { valor: number; vencimento: string; descricao: string | null },
  cliente: { razaoSocial: string; cpfCnpj: string; email: string | null; endereco: Record<string, string> | null },
  numero: number,
): DadosEmissao {
  const e = cliente.endereco ?? {};
  const temEnd = !!(e.cep || e.logradouro || e.cidade);
  return {
    valor: titulo.valor,
    vencimento: titulo.vencimento,
    pagadorNome: cliente.razaoSocial,
    pagadorDocumento: cliente.cpfCnpj.replace(/\D/g, ""),
    pagadorEmail: cliente.email,
    descricao: titulo.descricao ?? "Honorários",
    seuNumero: String(numero),
    pagadorEndereco: temEnd
      ? { cep: (e.cep ?? "").replace(/\D/g, ""), logradouro: e.logradouro ?? "", numero: e.numero ?? "", bairro: e.bairro ?? "", cidade: e.cidade ?? "", uf: e.uf ?? "" }
      : null,
  };
}
