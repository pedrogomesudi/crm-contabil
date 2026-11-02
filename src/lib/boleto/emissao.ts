import type { DadosEmissao } from "./tipos";

// O Inter imprime no máximo 5 linhas de mensagem ao pagador, de 78 caracteres cada — teto do
// provedor, não escolha nossa. Tudo o que passa de 390 caracteres não chega ao boleto.
const MAX_CHARS_LINHA = 78;
const MAX_LINHAS = 5;

// "2026-10-01" (date do banco) ou "2026-10" (input month) -> "10/2026".
function competenciaBR(competencia: string): string {
  const [ano, mes] = competencia.slice(0, 7).split("-");
  return `${mes}/${ano}`;
}

// O sufixo que identifica a natureza da cobrança, por origem do título. `null` = esta origem
// não leva observação nenhuma: cobrança avulsa é sempre pontual e o texto só confundiria.
function sufixoDaOrigem(origem: string, competencia: string | null): string | null {
  if (origem === "DECIMO_TERCEIRO") return "honorário de encerramento anual";
  if (origem === "MENSALIDADE" && competencia) return `competência ${competenciaBR(competencia)}`;
  return null;
}

// O mesmo texto da origem, como linha independente: "Competência 10/2026". É o cabeçalho do
// boleto de grupo, onde a competência é uma só para todas as empresas e repeti-la por empresa
// gastaria 308 dos 390 caracteres que o Inter imprime.
export function rotuloDaOrigem(origem: string, competencia: string | null): string | null {
  const sufixo = sufixoDaOrigem(origem, competencia);
  return sufixo ? sufixo[0]!.toUpperCase() + sufixo.slice(1) : null;
}

// Identificação de UMA empresa na mensagem do boleto: "RAZÃO SOCIAL — competência 10/2026" ou
// "RAZÃO SOCIAL — honorário de encerramento anual". `null` quando a origem não leva observação.
export function identificacaoBoleto(razaoSocial: string, origem: string, competencia: string | null): string | null {
  const nome = razaoSocial.trim();
  const sufixo = sufixoDaOrigem(origem, competencia);
  if (!sufixo) return null;
  return nome ? `${nome} — ${sufixo}` : rotuloDaOrigem(origem, competencia);
}

// Mensagem do boleto individual. Razão social comprida ganha uma linha só para ela e o sufixo
// vai na seguinte: truncar o nome do cliente no documento que ele recebe é pior que gastar linha.
export function linhasObservacaoBoleto(razaoSocial: string, origem: string, competencia: string | null): string[] {
  const juntas = identificacaoBoleto(razaoSocial, origem, competencia);
  if (!juntas) return [];
  if (juntas.length <= MAX_CHARS_LINHA) return [juntas];
  return [razaoSocial.trim(), rotuloDaOrigem(origem, competencia)!];
}

// Empacota N identificações no mínimo de linhas possível, separadas por vírgula — é assim que o
// boleto do grupo mostra todas as empresas. O teto de linhas é do provedor; quando a lista não
// cabe, a última linha diz quantas ficaram de fora, porque sumir em silêncio é pior que avisar.
// O corte é sempre em empresa inteira: meio nome no boleto não identifica ninguém.
export function empacotarLinhas(itens: string[], maxLinhas = MAX_LINHAS, maxChars = MAX_CHARS_LINHA): string[] {
  const aviso = (n: number) => `e mais ${n} empresa${n === 1 ? "" : "s"}`;

  // Preenche as linhas gulosamente. `reserva` é o espaço que a última linha guarda para o aviso.
  const empacotar = (reserva: number): { linhas: string[]; usados: number } => {
    const linhas: string[] = [];
    let i = 0;
    while (i < itens.length && linhas.length < maxLinhas) {
      const limite = maxChars - (linhas.length === maxLinhas - 1 ? reserva : 0);
      let linha = "";
      while (i < itens.length) {
        const candidata = linha ? `${linha}, ${itens[i]}` : itens[i]!;
        if (candidata.length > limite) break;
        linha = candidata;
        i += 1;
      }
      // Nada caber aqui tem duas causas. Se o item caberia numa linha cheia, foi a reserva do
      // aviso que o expulsou: a linha fica para o aviso e o item conta como excedente. Só quando
      // o item estoura a linha inteira é que truncar é inevitável.
      if (!linha) {
        if (itens[i]!.length <= maxChars) break;
        linha = itens[i]!.slice(0, limite);
        i += 1;
      }
      linhas.push(linha);
    }
    return { linhas, usados: i };
  };

  const solto = empacotar(0);
  if (solto.usados >= itens.length) return solto.linhas;

  // Reservar espaço para o aviso empurra itens para fora, o que muda o número no próprio aviso.
  // Converge rápido porque a reserva só cresce; três passadas cobrem a mudança de dígito.
  let texto = aviso(itens.length - solto.usados);
  for (let passada = 0; passada < 3; passada += 1) {
    const r = empacotar(texto.length + 2);
    const recalculado = aviso(itens.length - r.usados);
    if (recalculado === texto || passada === 2) {
      const linhas = r.linhas;
      const ultima = linhas[linhas.length - 1];
      if (linhas.length < maxLinhas || !ultima) linhas.push(recalculado);
      else linhas[linhas.length - 1] = `${ultima}, ${recalculado}`;
      return linhas;
    }
    texto = recalculado;
  }
  return solto.linhas;
}

export function dadosEmissaoDeTitulo(
  titulo: { valor: number; vencimento: string; descricao: string | null; origem: string; competencia: string | null },
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
    observacoes: linhasObservacaoBoleto(cliente.razaoSocial, titulo.origem, titulo.competencia),
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
