export type PerfilCliente = "mei" | "simples_sem_func" | "simples_com_func" | "presumido_real" | "pf";
export type FlagsProcesso = Record<string, boolean>;
export type StatusItem = "pendente" | "concluido" | "dispensado";
export type TemplateItem = {
  codigo: string;
  titulo: string;
  descricao: string | null;
  tipo: "padrao" | "acesso";
  responsavelPapel: string | null;
  prazoDias: number | null;
  aplicavelA: string[];
  condicaoFlags: string[];
  condicaoModo: "any" | "all";
  bloqueante: boolean;
  anexoObrigatorio: boolean;
  alertaRisco: string | null;
  ordem: number;
  dependeDe: string[];
  campoDestino: string | null;
};
export type TemplateBloco = { ordem: number; nome: string; prazoBlocoDias: number | null; itens: TemplateItem[] };
export type ProcessoItemSeed = {
  blocoOrdem: number;
  blocoNome: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  tipo: "padrao" | "acesso";
  responsavelPapel: string | null;
  prazo: string | null;
  bloqueante: boolean;
  anexoObrigatorio: boolean;
  alertaRisco: string | null;
  ordem: number;
  dependeDe: string[];
  campoDestino: string | null;
};

export function sugerirPerfil(tipoPessoa: string, regime: string, qtdFuncionarios: number | null): PerfilCliente {
  if (tipoPessoa === "PF") return "pf";
  if (regime === "MEI") return "mei";
  if (regime === "Simples") return (qtdFuncionarios ?? 0) > 0 ? "simples_com_func" : "simples_sem_func";
  if (regime === "Presumido" || regime === "Real") return "presumido_real";
  return "simples_sem_func";
}

export function somarDias(dataIso: string, n: number): string {
  const base = Date.parse(`${dataIso}T00:00:00Z`);
  return new Date(base + n * 86400000).toISOString().slice(0, 10);
}

export function itemAplica(
  item: { aplicavelA: string[]; condicaoFlags: string[]; condicaoModo: "any" | "all" },
  perfil: PerfilCliente,
  flags: FlagsProcesso,
): boolean {
  const perfilOk = item.aplicavelA.includes("*") || item.aplicavelA.includes(perfil);
  if (!perfilOk) return false;
  if (item.condicaoFlags.length === 0) return true;
  return item.condicaoModo === "any"
    ? item.condicaoFlags.some((f) => flags[f] === true)
    : item.condicaoFlags.every((f) => flags[f] === true);
}

export function materializarProcesso(
  blocos: TemplateBloco[],
  perfil: PerfilCliente,
  flags: FlagsProcesso,
  dataInicio: string,
): ProcessoItemSeed[] {
  const out: ProcessoItemSeed[] = [];
  for (const b of blocos) {
    for (const i of b.itens) {
      if (!itemAplica(i, perfil, flags)) continue;
      out.push({
        blocoOrdem: b.ordem,
        blocoNome: b.nome,
        codigo: i.codigo,
        titulo: i.titulo,
        descricao: i.descricao,
        tipo: i.tipo,
        responsavelPapel: i.responsavelPapel,
        prazo: i.prazoDias == null ? null : somarDias(dataInicio, i.prazoDias),
        bloqueante: i.bloqueante,
        anexoObrigatorio: i.anexoObrigatorio,
        alertaRisco: i.alertaRisco,
        ordem: i.ordem,
        dependeDe: i.dependeDe,
        campoDestino: i.campoDestino,
      });
    }
  }
  return out;
}

export function motivosBloqueioConclusao(
  item: {
    dependeDe: string[];
    anexoObrigatorio: boolean;
    temAnexo: boolean;
    campoDestino: string | null;
    temValorDestino: boolean;
  },
  itens: { codigo: string | null; status: StatusItem }[],
): string[] {
  const motivos: string[] = [];
  for (const dep of item.dependeDe) {
    const irmao = itens.find((i) => i.codigo === dep);
    const ok = irmao && (irmao.status === "concluido" || irmao.status === "dispensado");
    if (!ok) motivos.push(`Depende de ${dep}`);
  }
  if (item.anexoObrigatorio && !item.temAnexo) motivos.push("Anexo obrigatório pendente");
  if (item.campoDestino && !item.temValorDestino) motivos.push("Informe o valor (competência inicial)");
  return motivos;
}

export function progressoProcesso(itens: { status: StatusItem; prazo: string | null; bloqueante: boolean }[]): {
  total: number;
  concluidos: number;
  bloqueantesPendentes: number;
  pct: number;
  concluido: boolean;
  proximoPrazo: string | null;
} {
  const total = itens.length;
  const concluidos = itens.filter((i) => i.status === "concluido").length;
  const bloqueantesPendentes = itens.filter((i) => i.bloqueante && i.status === "pendente").length;
  const pct = total === 0 ? 0 : Math.round((concluidos / total) * 100);
  const concluido = total > 0 && itens.every((i) => i.status === "concluido" || i.status === "dispensado");
  const prazos = itens
    .filter((i) => i.status === "pendente" && i.prazo)
    .map((i) => i.prazo as string)
    .sort();
  return { total, concluidos, bloqueantesPendentes, pct, concluido, proximoPrazo: prazos[0] ?? null };
}
