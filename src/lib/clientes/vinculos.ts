export type VinculoTipo = "grupo" | "matriz" | "filial" | "socio";
export type EmpresaRelacionada = { clienteId: string; nome: string; tipos: VinculoTipo[] };

// Junta empresas do mesmo grupo, a matriz, as filiais e os "colegas de sócio"
// numa lista deduplicada por clienteId, somando os motivos. Exclui `self`.
// A ordem de saída é estável (ordem da primeira aparição).
export function consolidarRelacionadas(
  self: string,
  fontes: { tipo: VinculoTipo; empresas: { clienteId: string; nome: string }[] }[],
): EmpresaRelacionada[] {
  const porId = new Map<string, EmpresaRelacionada>();
  const ordem: string[] = [];
  for (const { tipo, empresas } of fontes) {
    for (const e of empresas) {
      if (e.clienteId === self) continue;
      let atual = porId.get(e.clienteId);
      if (!atual) {
        atual = { clienteId: e.clienteId, nome: e.nome, tipos: [] };
        porId.set(e.clienteId, atual);
        ordem.push(e.clienteId);
      }
      if (!atual.tipos.includes(tipo)) atual.tipos.push(tipo);
    }
  }
  return ordem.map((id) => porId.get(id)!);
}

// Retorna a mensagem de erro (ou null) ao definir `matrizId` como matriz de `clienteId`.
export function validarNovaMatriz(clienteId: string, matrizId: string, matrizEhFilial: boolean): string | null {
  if (matrizId === clienteId) return "Um cliente não pode ser a própria matriz.";
  if (matrizEhFilial) return "O cliente escolhido já é uma filial; escolha a matriz dele.";
  return null;
}
