// Consulta de CNPJ na BrasilAPI (espelha o cadastro oficial da Receita Federal).
// Gratuito, sem chave. Retorna razão social, situação cadastral e endereço.

export type EnderecoReceita = {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
};
export type DadosReceita = {
  razaoSocial: string | null;
  situacao: string | null;
  endereco: EnderecoReceita;
};

const limpar = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
};

// Mapeia a resposta bruta da BrasilAPI para o shape do CRM. Puro (testável).
export function mapearReceita(d: Record<string, unknown>): DadosReceita {
  const endereco: EnderecoReceita = {};
  const set = (k: keyof EnderecoReceita, valor: unknown) => {
    const v = limpar(valor);
    if (v) endereco[k] = v;
  };
  set("logradouro", d.logradouro);
  set("numero", d.numero);
  set("complemento", d.complemento);
  set("bairro", d.bairro);
  set("cidade", d.municipio);
  set("uf", d.uf);
  set("cep", d.cep);
  return {
    razaoSocial: limpar(d.razao_social) ?? null,
    situacao: limpar(d.descricao_situacao_cadastral) ?? null,
    endereco,
  };
}

export type ResultadoConsulta = { dados?: DadosReceita; erro?: string };

// Consulta um CNPJ (14 dígitos) na BrasilAPI, com timeout. Erros viram { erro }.
export async function consultarCnpj(cnpj: string): Promise<ResultadoConsulta> {
  const doc = cnpj.replace(/\D/g, "");
  if (doc.length !== 14) return { erro: "Não é um CNPJ (14 dígitos)." };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, {
      signal: ctrl.signal,
      // User-Agent explícito: o Cloudflare da BrasilAPI bloqueia (403) o UA
      // padrão do fetch do Node ("node"). Um UA descritivo passa normalmente.
      headers: { accept: "application/json", "user-agent": "crm-contabil/1.0 (+integracao-receita)" },
    });
    if (res.status === 404) return { erro: "CNPJ não encontrado na Receita." };
    if (res.status === 429) return { erro: "Limite de consultas atingido — tente novamente em instantes." };
    if (!res.ok) return { erro: `Falha na consulta (HTTP ${res.status}).` };
    const dados = (await res.json()) as Record<string, unknown>;
    return { dados: mapearReceita(dados) };
  } catch (e) {
    return { erro: e instanceof Error && e.name === "AbortError" ? "Tempo esgotado na consulta." : "Erro de rede na consulta." };
  } finally {
    clearTimeout(timer);
  }
}
