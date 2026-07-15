// Política de retenção dos dumps: manter os 7 DIÁRIOS mais recentes + o dump de cada
// DOMINGO das últimas 4 semanas. Pura e testável (o teste no vitest importa daqui).
//
// Entrada: nomes "AAAA-MM-DD.sql.gz". Saída: { manter: [...], apagar: [...] }.
const DATA_RE = /^(\d{4}-\d{2}-\d{2})\.sql\.gz$/;

function ehDomingo(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 0;
}

function diasEntre(aIso, bIso) {
  const p = (s) => {
    const [a, m, d] = s.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((p(bIso) - p(aIso)) / 86_400_000);
}

export function planoRetencao(nomes, hojeIso) {
  const datas = nomes
    .map((n) => ({ nome: n, data: (DATA_RE.exec(n) ?? [])[1] }))
    .filter((x) => x.data)
    .sort((a, b) => b.data.localeCompare(a.data)); // mais recente primeiro

  const manter = new Set();

  // 7 diários mais recentes.
  for (const x of datas.slice(0, 7)) manter.add(x.nome);

  // 4 semanais: os domingos mais recentes dentro de ~28 dias.
  const domingos = datas.filter((x) => ehDomingo(x.data) && diasEntre(x.data, hojeIso) <= 28);
  for (const x of domingos.slice(0, 4)) manter.add(x.nome);

  const apagar = datas.filter((x) => !manter.has(x.nome)).map((x) => x.nome);
  return { manter: [...manter], apagar };
}
