// Consulta de CNPJ na Receita Federal via fontes públicas. Provedor primário:
// BrasilAPI. Fallback (só quando a BrasilAPI não tem o CNPJ — 404, típico de
// empresas recém-abertas): ReceitaWS. Ambos gratuitos, sem chave. Retornam
// razão social, situação cadastral e endereço.

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
  nomeFantasia: string | null;
  situacao: string | null;
  endereco: EnderecoReceita;
};

const UA = "crm-contabil/1.0 (+integracao-receita)";
const limpar = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  return s ? s : undefined;
};
const cepDigitos = (v: unknown): string | undefined => {
  const s = String(v ?? "").replace(/\D/g, "");
  return s ? s : undefined;
};

// Mapeia a resposta da BrasilAPI para o shape do CRM. Puro (testável).
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
  const cep = cepDigitos(d.cep);
  if (cep) endereco.cep = cep;
  return {
    razaoSocial: limpar(d.razao_social) ?? null,
    nomeFantasia: limpar(d.nome_fantasia) ?? null,
    situacao: limpar(d.descricao_situacao_cadastral) ?? null,
    endereco,
  };
}

// Mapeia a resposta da ReceitaWS (campos com nomes diferentes). Puro (testável).
export function mapearReceitaWs(d: Record<string, unknown>): DadosReceita {
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
  const cep = cepDigitos(d.cep);
  if (cep) endereco.cep = cep;
  return {
    razaoSocial: limpar(d.nome) ?? null,
    nomeFantasia: limpar(d.fantasia) ?? null,
    situacao: limpar(d.situacao) ?? null,
    endereco,
  };
}

// Mescla dois resultados: o primário vence onde tem valor; o secundário preenche
// as lacunas (ex.: BrasilAPI achou mas sem logradouro → ReceitaWS completa).
export function mesclarDados(primario: DadosReceita, secundario: DadosReceita): DadosReceita {
  return {
    razaoSocial: primario.razaoSocial ?? secundario.razaoSocial,
    nomeFantasia: primario.nomeFantasia ?? secundario.nomeFantasia,
    situacao: primario.situacao ?? secundario.situacao,
    endereco: { ...secundario.endereco, ...primario.endereco },
  };
}

type Interno = { dados?: DadosReceita; erro?: string; naoEncontrado?: boolean };

async function comTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function consultarBrasilApi(doc: string): Promise<Interno> {
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`, {
        signal,
        headers: { accept: "application/json", "user-agent": UA },
      });
      if (res.status === 404) return { erro: "CNPJ não encontrado na Receita.", naoEncontrado: true };
      if (res.status === 429) return { erro: "Limite de consultas atingido — tente novamente em instantes." };
      if (!res.ok) return { erro: `Falha na consulta (HTTP ${res.status}).` };
      return { dados: mapearReceita((await res.json()) as Record<string, unknown>) };
    });
  } catch (e) {
    return {
      erro: e instanceof Error && e.name === "AbortError" ? "Tempo esgotado na consulta." : "Erro de rede na consulta.",
    };
  }
}

async function consultarReceitaWs(doc: string): Promise<Interno> {
  try {
    return await comTimeout(async (signal) => {
      const res = await fetch(`https://receitaws.com.br/v1/cnpj/${doc}`, {
        signal,
        headers: { accept: "application/json", "user-agent": UA },
      });
      if (res.status === 429)
        return { erro: "Limite de consultas atingido na fonte alternativa — tente novamente em instantes." };
      if (!res.ok) return { erro: `Falha na consulta alternativa (HTTP ${res.status}).` };
      const d = (await res.json()) as Record<string, unknown>;
      if (String(d.status ?? "").toUpperCase() !== "OK")
        return { erro: "CNPJ não encontrado na Receita.", naoEncontrado: true };
      return { dados: mapearReceitaWs(d) };
    });
  } catch (e) {
    return {
      erro:
        e instanceof Error && e.name === "AbortError"
          ? "Tempo esgotado na consulta alternativa."
          : "Erro de rede na consulta alternativa.",
    };
  }
}

export type ResultadoConsulta = { dados?: DadosReceita; erro?: string };

// Consulta um CNPJ (14 dígitos): BrasilAPI e, só se ela não tiver o CNPJ (404),
// tenta a ReceitaWS (costuma ter empresas recém-abertas). Erros viram { erro }.
export async function consultarCnpj(cnpj: string): Promise<ResultadoConsulta> {
  const doc = cnpj.replace(/\D/g, "");
  if (doc.length !== 14) return { erro: "Não é um CNPJ (14 dígitos)." };
  const b = await consultarBrasilApi(doc);
  if (b.dados) {
    // Achou na BrasilAPI, mas o endereço pode vir incompleto (sem logradouro).
    // Nesse caso, complementa pela ReceitaWS (mescla). Se a ReceitaWS falhar,
    // mantém o que a BrasilAPI trouxe (degradação graciosa).
    if (!b.dados.endereco.logradouro) {
      const r = await consultarReceitaWs(doc);
      if (r.dados) return { dados: mesclarDados(b.dados, r.dados) };
    }
    return { dados: b.dados };
  }
  if (b.naoEncontrado) {
    const r = await consultarReceitaWs(doc);
    if (r.dados) return { dados: r.dados };
    return { erro: r.erro ?? b.erro };
  }
  return { erro: b.erro };
}
