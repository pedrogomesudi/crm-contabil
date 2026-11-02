// Conferência honorários: financeiro × fiscal.
//
// De um lado o título de mensalidade e o boleto; do outro a NFS-e. Eles deveriam dizer o mesmo
// valor, e quando não dizem alguém recebe uma nota de R$ 250 com um boleto de R$ 287 — foi o que
// aconteceu em 10/2026 com dois clientes, descoberto só porque um deles reclamou.
//
// Núcleo puro: recebe os dados já carregados e devolve as linhas classificadas. Sem banco, para
// que cada regra tenha teste e para que a tela e a exportação leiam exatamente a mesma conta.

export const SITUACOES = {
  VALOR_DIVERGE: "Valor da nota diferente do boleto",
  SEM_NOTA: "Honorário sem nota fiscal",
  SEM_BOLETO: "Honorário sem boleto",
  BOLETO_INCOMPLETO: "Boleto sem linha digitável",
  SEM_CONTATO: "Cliente sem canal de contato",
  NOTA_DUPLICADA: "Mais de uma nota com o valor do honorário",
  NOTA_OUTRO_SERVICO: "Nota de outro serviço na competência",
  NOTA_CANCELADA: "Nota cancelada na competência",
  FATURA_ENCERRADA: "Fatura já baixada ou cancelada",
} as const;

// As que colocam cobrança errada na mão do cliente, ou impedem a cobrança de chegar.
// As demais são contexto: existem, o usuário precisa ver, mas não há nada errado nelas.
const IMPEDEM = new Set<string>([
  SITUACOES.VALOR_DIVERGE,
  SITUACOES.SEM_NOTA,
  SITUACOES.SEM_BOLETO,
  SITUACOES.BOLETO_INCOMPLETO,
  SITUACOES.SEM_CONTATO,
  SITUACOES.NOTA_DUPLICADA,
]);

export type NotaConferencia = { numero: number | null; valor: number; cancelada: boolean };

export type ClienteConferencia = {
  clienteId: string;
  razaoSocial: string;
  grupoNome: string | null;
  titulo: { valor: number; status: string } | null;
  notas: NotaConferencia[];
  boleto: { numero: number; temLinhaDigitavel: boolean } | null;
  temContato: boolean;
};

export type LinhaConferencia = {
  clienteId: string;
  razaoSocial: string;
  grupoNome: string | null;
  valorTitulo: number | null;
  valorNota: number | null;
  numeroNota: number | null;
  numeroBoleto: number | null;
  situacoes: string[];
  impede: boolean;
};

export type EntradaConferencia = {
  linhas: LinhaConferencia[];
  totais: { financeiro: number; fiscal: number; diferenca: number; clientes: number; comDivergencia: number };
};

const centavos = (n: number) => Math.round(n * 100);
const casa = (a: number, b: number) => centavos(a) === centavos(b);

function classificar(c: ClienteConferencia): LinhaConferencia {
  const situacoes: string[] = [];
  const vivas = c.notas.filter((n) => !n.cancelada);
  if (c.notas.some((n) => n.cancelada)) situacoes.push(SITUACOES.NOTA_CANCELADA);

  // A nota de honorário é a que casa em valor com o título — mesma regra do envio em lote.
  const doHonorario = c.titulo ? vivas.filter((n) => casa(n.valor, c.titulo!.valor)) : [];
  const nota = doHonorario[0] ?? null;

  if (!c.titulo) {
    situacoes.push(SITUACOES.NOTA_OUTRO_SERVICO);
  } else {
    if (doHonorario.length > 1) situacoes.push(SITUACOES.NOTA_DUPLICADA);
    if (vivas.length > doHonorario.length) situacoes.push(SITUACOES.NOTA_OUTRO_SERVICO);
    if (!nota) {
      // Há nota viva, mas nenhuma no valor do título: é divergência de valor, não ausência.
      situacoes.push(vivas.length ? SITUACOES.VALOR_DIVERGE : SITUACOES.SEM_NOTA);
    }
    if (c.titulo.status === "BAIXADO" || c.titulo.status === "CANCELADO") {
      situacoes.push(SITUACOES.FATURA_ENCERRADA);
    } else {
      if (!c.boleto) situacoes.push(SITUACOES.SEM_BOLETO);
      else if (!c.boleto.temLinhaDigitavel) situacoes.push(SITUACOES.BOLETO_INCOMPLETO);
      if (!c.temContato) situacoes.push(SITUACOES.SEM_CONTATO);
    }
  }

  // Quando o valor diverge, mostra a nota viva que existe — é ela que o usuário precisa comparar
  // com o título para ver o tamanho da diferença.
  const exibida = nota ?? (situacoes.includes(SITUACOES.VALOR_DIVERGE) ? (vivas[0] ?? null) : null);

  return {
    clienteId: c.clienteId,
    razaoSocial: c.razaoSocial,
    grupoNome: c.grupoNome,
    valorTitulo: c.titulo?.valor ?? null,
    valorNota: exibida?.valor ?? null,
    numeroNota: exibida?.numero ?? null,
    numeroBoleto: c.boleto?.numero ?? null,
    situacoes,
    impede: situacoes.some((s) => IMPEDEM.has(s)),
  };
}

export function conferirHonorarios(clientes: ClienteConferencia[]): EntradaConferencia {
  const linhas = clientes.map(classificar);
  // Problema primeiro: a tela existe para encontrar o que está errado, não para ser lida inteira.
  linhas.sort((a, b) =>
    a.impede === b.impede ? a.razaoSocial.localeCompare(b.razaoSocial, "pt-BR") : a.impede ? -1 : 1,
  );

  const financeiro = linhas.reduce((s, l) => s + (l.valorTitulo ?? 0), 0);
  // O lado fiscal soma só o que casa com um honorário: nota de outro serviço e nota cancelada
  // não entram, senão a diferença deixaria de significar o que o nome diz.
  const fiscal = linhas.reduce(
    (s, l) =>
      s +
      (l.situacoes.includes(SITUACOES.VALOR_DIVERGE)
        ? (l.valorNota ?? 0)
        : l.valorTitulo !== null && l.valorNota !== null
          ? l.valorNota
          : 0),
    0,
  );

  return {
    linhas,
    totais: {
      financeiro: Number(financeiro.toFixed(2)),
      fiscal: Number(fiscal.toFixed(2)),
      diferenca: Number((fiscal - financeiro).toFixed(2)),
      clientes: linhas.length,
      comDivergencia: linhas.filter((l) => l.impede).length,
    },
  };
}
