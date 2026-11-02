import type { DadosEmissao } from "./tipos";

// O Inter imprime até 5 linhas de mensagem, de ~78 caracteres cada, e corta o que passa disso.
const MAX_CHARS_LINHA = 78;

// "2026-10-01" (date do banco) ou "2026-10" (input month) -> "10/2026".
function competenciaBR(competencia: string): string {
  const [ano, mes] = competencia.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

// Identificação impressa no boleto: de quem é a cobrança e de que mês.
// Uma linha só quando cabe; razão social comprida vai numa linha e a competência na seguinte,
// porque truncar o nome do cliente no documento que ele recebe é pior do que gastar uma linha.
export function linhasObservacaoBoleto(nome: string, competencia: string | null): string[] {
  const n = nome.trim();
  if (!competencia) return n ? [n] : [];
  const comp = competenciaBR(competencia);
  if (!n) return [`Competência ${comp}`];
  const juntas = `${n} — competência ${comp}`;
  return juntas.length <= MAX_CHARS_LINHA ? [juntas] : [n, `Competência ${comp}`];
}

export function dadosEmissaoDeTitulo(
  titulo: { valor: number; vencimento: string; descricao: string | null; competencia: string | null },
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
    observacoes: linhasObservacaoBoleto(cliente.razaoSocial, titulo.competencia),
    pagadorEndereco: temEnd
      ? {
          cep: (e.cep ?? "").replace(/\D/g, ""),
          logradouro: e.logradouro ?? "",
          numero: e.numero ?? "",
          bairro: e.bairro ?? "",
          cidade: e.cidade ?? "",
          uf: e.uf ?? "",
        }
      : null,
  };
}
