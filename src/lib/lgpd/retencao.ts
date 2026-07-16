// A trava que impede a anonimização de violar a obrigação de guarda fiscal.
// Datas em UTC, como no resto do projeto.

// O cliente ainda está dentro do prazo de retenção contado da data de saída?
// Sem data de saída = ainda em atividade = retém sempre.
export function dentroDaRetencao(dataSaidaIso: string | null, meses: number, hojeIso: string): boolean {
  if (!dataSaidaIso) return true;
  const [as, ms, ds] = dataSaidaIso.slice(0, 10).split("-").map(Number);
  // Data-limite = saída + `meses`.
  const limite = new Date(Date.UTC(as ?? 1970, (ms ?? 1) - 1 + meses, ds ?? 1));
  const [ah, mh, dh] = hojeIso.slice(0, 10).split("-").map(Number);
  const hoje = new Date(Date.UTC(ah ?? 1970, (mh ?? 1) - 1, dh ?? 1));
  return hoje.getTime() <= limite.getTime();
}

export type SinaisFiscais = {
  temNfse: boolean;
  temTitulo: boolean;
  temDocumento: boolean;
  temObrigacao: boolean;
};

// Reter o esqueleto fiscal quando: há registro fiscal (obrigação legal de guarda) OU o
// cliente ainda está dentro do prazo de retenção. Só libera a anonimização plena quando
// não há NADA fiscal E o prazo já venceu.
export function vereditoRetencao(
  s: SinaisFiscais,
  dataSaidaIso: string | null,
  meses: number,
  hojeIso: string,
): { reter: boolean; motivo: string } {
  const temFiscal = s.temNfse || s.temTitulo || s.temDocumento || s.temObrigacao;
  if (temFiscal) {
    return {
      reter: true,
      motivo:
        "Há registros fiscais (NFS-e, títulos, documentos ou obrigações) sob guarda legal " +
        "(obrigação legal — CTN/CC). O esqueleto fiscal é retido; só os dados pessoais não-fiscais são anonimizados.",
    };
  }
  if (dentroDaRetencao(dataSaidaIso, meses, hojeIso)) {
    return {
      reter: true,
      motivo: `Cliente dentro do prazo de retenção de ${meses} meses. O esqueleto é retido até o vencimento.`,
    };
  }
  return { reter: false, motivo: "Sem registros fiscais e fora do prazo de retenção." };
}
