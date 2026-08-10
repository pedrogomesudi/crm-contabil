// Conferência do fechamento: avalia, para um cliente numa competência, se as quatro peças
// do ciclo — honorário, título, nota fiscal e boleto — existem e batem em valor. Puro e
// testável; a action monta os dados, esta função decide o status e as pendências.

export type LinhaConferencia = {
  clienteId: string;
  cliente: string;
  honorario: number | null; // clientes_financeiro.honorario_mensal (null = sem honorário)
  titulo: number | null; // valor do título MENSALIDADE da competência (null = não gerado)
  temNota: boolean; // há ao menos uma NFS-e autorizada na competência
  notaValor: number | null; // valor da nota que representa o honorário (a que casa) ou, se nenhuma casa, o valor de uma nota candidata para exibir
  notaCasa: boolean; // existe nota autorizada cujo valor casa com o título
  boleto: number | null; // valor do boleto ativo do título (null = sem boleto)
};

export type NivelConferencia = "pronto" | "falta" | "bloqueado" | "sem_honorario";

export type ResultadoConferencia = { nivel: NivelConferencia; pendencias: string[] };

// Igualdade em centavos (evita ruído de ponto flutuante).
function bate(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

export function avaliarConferencia(l: LinhaConferencia): ResultadoConferencia {
  if (l.honorario == null) return { nivel: "sem_honorario", pendencias: ["Sem honorário cadastrado"] };

  const pend: string[] = [];
  let bloqueado = false;

  // Título
  if (l.titulo == null) {
    pend.push("Sem título");
  } else if (!bate(l.titulo, l.honorario)) {
    pend.push("Título ≠ honorário");
    bloqueado = true;
  }

  // Nota fiscal
  if (!l.temNota) {
    pend.push("Sem nota");
  } else if (!l.notaCasa) {
    pend.push("Nota não confere com o boleto");
    bloqueado = true;
  }

  // Boleto
  if (l.boleto == null) {
    pend.push("Sem boleto");
  } else if (l.titulo != null && !bate(l.boleto, l.titulo)) {
    pend.push("Boleto ≠ título");
    bloqueado = true;
  }

  if (bloqueado) return { nivel: "bloqueado", pendencias: pend };
  if (pend.length > 0) return { nivel: "falta", pendencias: pend };
  return { nivel: "pronto", pendencias: [] };
}

// Resumo agregado para os cards do topo.
export function resumirConferencia(linhas: (ResultadoConferencia & { linha: LinhaConferencia })[]): {
  total: number;
  pronto: number;
  falta: number;
  bloqueado: number;
  semHonorario: number;
  semBoleto: number;
  semNota: number;
  notaDiverge: number;
} {
  const r = {
    total: linhas.length,
    pronto: 0,
    falta: 0,
    bloqueado: 0,
    semHonorario: 0,
    semBoleto: 0,
    semNota: 0,
    notaDiverge: 0,
  };
  for (const item of linhas) {
    if (item.nivel === "pronto") r.pronto++;
    else if (item.nivel === "falta") r.falta++;
    else if (item.nivel === "bloqueado") r.bloqueado++;
    else if (item.nivel === "sem_honorario") r.semHonorario++;
    if (item.pendencias.includes("Sem boleto")) r.semBoleto++;
    if (item.pendencias.includes("Sem nota")) r.semNota++;
    if (item.pendencias.includes("Nota não confere com o boleto")) r.notaDiverge++;
  }
  return r;
}
