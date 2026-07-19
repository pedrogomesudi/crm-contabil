// Sanea o nome para uso como object name no Storage: tira acentos (NFD), troca o que não for
// letra/número/._- por "_", colapsa repetições, remove pontos/underscores das pontas (anti path
// traversal) e limita o tamanho. O nome original é guardado em tarefa_anexo.nome para exibição.
export function nomeSeguro(nome: string): string {
  const semAcento = nome.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const limpo = semAcento
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .replace(/[._]+$/, "");
  return limpo.length > 0 ? limpo.slice(0, 100) : "arquivo";
}

export function caminhoAnexoTarefa(tarefaId: string, nomeArquivo: string, id: string): string {
  return `tarefas/${tarefaId}/${id}-${nomeSeguro(nomeArquivo)}`;
}
