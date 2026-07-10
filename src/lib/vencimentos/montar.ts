// União pura das três fontes de vencimento. A server action faz o IO e a resolução
// dos nomes; aqui só há transformação — o que torna a regra de `editavel` testável.
import { classificarVencimento, type ItemVencimento } from "./alerta";

export type LinhaCertificado = {
  id: string;
  tipo: string;
  titular: string;
  validade: string;
  clienteId: string;
  clienteNome: string;
};
export type LinhaProcuracao = {
  id: string;
  orgao: string;
  outorgante: string;
  validade: string;
  clienteId: string;
  clienteNome: string;
};
export type LinhaNfse = {
  clienteId: string | null;
  validade: string; // já em YYYY-MM-DD
  origem: string; // nfse_cliente | nfse_escritorio
  clienteNome: string;
};

export function montarItens(
  entrada: { certificados: LinhaCertificado[]; procuracoes: LinhaProcuracao[]; nfse: LinhaNfse[] },
  hoje: string,
): ItemVencimento[] {
  const itens: ItemVencimento[] = [];

  for (const c of entrada.certificados) {
    const { severidade, diasRestantes } = classificarVencimento(c.validade, hoje);
    itens.push({
      id: c.id,
      origem: "certificado",
      clienteId: c.clienteId,
      clienteNome: c.clienteNome,
      titulo: `Certificado ${c.tipo}`,
      detalhe: c.titular,
      validade: c.validade,
      severidade,
      diasRestantes,
      editavel: true,
    });
  }

  for (const p of entrada.procuracoes) {
    const { severidade, diasRestantes } = classificarVencimento(p.validade, hoje);
    itens.push({
      id: p.id,
      origem: "procuracao",
      clienteId: p.clienteId,
      clienteNome: p.clienteNome,
      titulo: `Procuração — ${p.orgao}`,
      detalhe: p.outorgante,
      validade: p.validade,
      severidade,
      diasRestantes,
      editavel: true,
    });
  }

  // Vindas da NFS-e: nunca editáveis aqui — renovar o A1 é na tela da NFS-e.
  for (const n of entrada.nfse) {
    const { severidade, diasRestantes } = classificarVencimento(n.validade, hoje);
    itens.push({
      id: `nfse:${n.clienteId ?? "escritorio"}`,
      origem: "nfse",
      clienteId: n.clienteId,
      clienteNome: n.clienteNome,
      titulo: "Certificado A1 (NFS-e)",
      detalhe: n.origem === "nfse_escritorio" ? "Emissão de honorários" : "Emissão do cliente",
      validade: n.validade,
      severidade,
      diasRestantes,
      editavel: false,
    });
  }

  return itens;
}
