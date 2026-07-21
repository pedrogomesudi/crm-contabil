export type LinhaProdutividade = {
  usuarioId: string;
  nome: string;
  minutos: number; // horas apontadas, em minutos
  tarefas: number; // tarefas concluídas no período
  obrigacoes: number; // obrigações entregues no período
  carteira: number; // clientes distintos com hora apontada no período
};

// Apontamento já reduzido ao que a agregação precisa (a action projeta isto do banco).
export type ApontamentoBruto = { usuario_id: string; cliente_id: string | null; minutos: number };

// Universo = `equipe`: toda pessoa ativa vira uma linha, mesmo com tudo zero — ausência de
// produção precisa ser visível, não sumir. Ids fora da equipe (inativo que apontou no
// passado) não geram linha: o relatório não inventa colaborador.
export function agruparProdutividade(args: {
  equipe: { id: string; nome: string }[];
  apontamentos: ApontamentoBruto[];
  tarefasPorResponsavel: Record<string, number>;
  obrigacoesPorEntregador: Record<string, number>;
}): LinhaProdutividade[] {
  const { equipe, apontamentos, tarefasPorResponsavel, obrigacoesPorEntregador } = args;

  const minutosPorUsuario = new Map<string, number>();
  const clientesPorUsuario = new Map<string, Set<string>>();
  for (const a of apontamentos) {
    minutosPorUsuario.set(a.usuario_id, (minutosPorUsuario.get(a.usuario_id) ?? 0) + a.minutos);
    if (a.cliente_id) {
      const set = clientesPorUsuario.get(a.usuario_id) ?? new Set<string>();
      set.add(a.cliente_id);
      clientesPorUsuario.set(a.usuario_id, set);
    }
  }

  const linhas: LinhaProdutividade[] = equipe.map((u) => ({
    usuarioId: u.id,
    nome: u.nome,
    minutos: minutosPorUsuario.get(u.id) ?? 0,
    tarefas: tarefasPorResponsavel[u.id] ?? 0,
    obrigacoes: obrigacoesPorEntregador[u.id] ?? 0,
    carteira: clientesPorUsuario.get(u.id)?.size ?? 0,
  }));

  // Métrica-âncora é hora; desempate estável por nome.
  return linhas.sort((a, b) => b.minutos - a.minutos || a.nome.localeCompare(b.nome));
}
