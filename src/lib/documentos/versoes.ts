// Agrupa a lista plana em (atual, anteriores[]). "atual" = id não referenciado por nenhum
// substitui_id; "anteriores" = a cadeia via substitui_id, do mais recente ao mais antigo.
// A ordem dos grupos preserva a ordem de entrada dos atuais. Um conjunto de visitados evita
// laço em caso de ciclo (que o fluxo de gravação não produz).
export function agruparVersoes<T extends { id: string; substitui_id: string | null }>(
  docs: T[],
): { atual: T; anteriores: T[] }[] {
  const porId = new Map(docs.map((doc) => [doc.id, doc]));
  const referidos = new Set<string>();
  for (const doc of docs) if (doc.substitui_id) referidos.add(doc.substitui_id);

  const grupos: { atual: T; anteriores: T[] }[] = [];
  for (const doc of docs) {
    if (referidos.has(doc.id)) continue; // alguém o substitui → não é atual
    const anteriores: T[] = [];
    const visitados = new Set<string>([doc.id]);
    let cur = doc.substitui_id ? porId.get(doc.substitui_id) : undefined;
    while (cur && !visitados.has(cur.id)) {
      anteriores.push(cur);
      visitados.add(cur.id);
      cur = cur.substitui_id ? porId.get(cur.substitui_id) : undefined;
    }
    grupos.push({ atual: doc, anteriores });
  }
  return grupos;
}
