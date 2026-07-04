// Resolve o código IBGE do município (7 dígitos) a partir do CEP, via ViaCEP.
// Necessário para o cMun do TOMADOR na DPS: o SEFIN valida que o CEP pertence ao
// município informado (senão E0240). Clientes de outra cidade têm CEP de outro
// município — não dá para usar o município do prestador. Retorna null em erro/
// CEP inexistente; o chamador cai no município do prestador (fallback).
export async function municipioIbgePorCep(cep: string): Promise<string | null> {
  const doc = String(cep ?? "").replace(/\D/g, "");
  if (doc.length !== 8) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://viacep.com.br/ws/${doc}/json/`, {
      signal: ctrl.signal,
      headers: { accept: "application/json", "user-agent": "crm-contabil/1.0" },
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { ibge?: string; erro?: boolean };
    if (d.erro || !d.ibge) return null;
    const ibge = String(d.ibge).replace(/\D/g, "");
    return ibge.length === 7 ? ibge : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
