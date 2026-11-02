// Uma empresa membro de um grupo de cobrança, com o honorário que ela contribui ao boleto único.
export type MembroGrupo = {
  clienteId: string;
  razaoSocial: string;
  cpfCnpj: string;
  honorario: number;
};

export function somarHonorariosGrupo(membros: MembroGrupo[]): number {
  return Number(membros.reduce((s, m) => s + Number(m.honorario || 0), 0).toFixed(2));
}

// Abrevia as razões sociais do grupo ao primeiro nome, para caberem na mensagem do boleto —
// "BRAVE AGRONEGOCIOS LTDA" vira "BRAVE". Empresas do mesmo grupo costumam compartilhar o
// primeiro nome (duas CONSTROI, duas UNA); nesse caso só as que colidem ganham o nome seguinte,
// até ficarem distintas. Abreviar todas por igual seria mais simples e deixaria o boleto ambíguo.
export function abreviarRazoesSociais(razoes: string[]): string[] {
  const palavras = razoes.map((r) => r.trim().split(/\s+/).filter(Boolean));
  const usadas = palavras.map(() => 1);

  // Cada passada resolve um nível de colisão. O teto é o maior nome: além dele não há o que
  // acrescentar, e razões realmente idênticas param aqui em vez de girar para sempre.
  const maxPalavras = Math.max(0, ...palavras.map((p) => p.length));
  for (let passada = 0; passada < maxPalavras; passada += 1) {
    const atual = palavras.map((p, i) => p.slice(0, usadas[i]!).join(" "));
    const quantos = new Map<string, number>();
    for (const a of atual) quantos.set(a.toUpperCase(), (quantos.get(a.toUpperCase()) ?? 0) + 1);

    let mudou = false;
    atual.forEach((a, i) => {
      if ((quantos.get(a.toUpperCase()) ?? 0) > 1 && usadas[i]! < palavras[i]!.length) {
        usadas[i] = usadas[i]! + 1;
        mudou = true;
      }
    });
    if (!mudou) break;
  }
  return palavras.map((p, i) => p.slice(0, usadas[i]!).join(" "));
}
