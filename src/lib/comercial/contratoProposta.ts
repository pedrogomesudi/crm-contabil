export type EstadoContrato = {
  oportunidadeId: string;
  clienteId: string | null;
  contratoDocId: string | null;
  assinaturaStatus: string | null;
  propostaAceita: boolean;
};
export type Passo = {
  chave: "converter" | "gerar" | "assinar";
  rotulo: string;
  situacao: "feito" | "atual" | "pendente";
  href: string | null;
  detalhe?: string;
};

const STATUS: Record<string, string> = {
  enviado: "Enviado — aguardando assinatura",
  parcial: "Parcialmente assinado",
  finalizado: "Assinado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export function rotuloStatusAssinatura(status: string | null): string {
  return status ? (STATUS[status] ?? status) : "Não enviado";
}

export function passosContrato(e: EstadoContrato): Passo[] {
  const feitos = {
    converter: e.clienteId != null,
    gerar: e.contratoDocId != null,
    assinar: e.assinaturaStatus === "finalizado",
  };
  const telaCliente = e.clienteId ? `/clientes/${e.clienteId}` : null;
  const bruto: Omit<Passo, "situacao">[] = [
    {
      chave: "converter",
      rotulo: "Converter em cliente",
      href: e.clienteId ? telaCliente : `/clientes/novo?oportunidade=${e.oportunidadeId}`,
    },
    { chave: "gerar", rotulo: "Gerar contrato", href: telaCliente },
    {
      chave: "assinar",
      rotulo: "Enviar para assinatura",
      href: telaCliente,
      detalhe: rotuloStatusAssinatura(e.assinaturaStatus),
    },
  ];
  let atualUsado = false;
  return bruto.map((p) => {
    const feito = feitos[p.chave];
    let situacao: Passo["situacao"];
    if (feito) situacao = "feito";
    else if (!atualUsado) {
      situacao = "atual";
      atualUsado = true;
    } else situacao = "pendente";
    // um passo pendente só ganha destino quando o cliente já existe (senão, ainda não navega)
    const href = situacao === "pendente" && !feitos.converter ? null : p.href;
    return { ...p, situacao, href };
  });
}
