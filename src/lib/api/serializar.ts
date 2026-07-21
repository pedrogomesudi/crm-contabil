type Row = Record<string, unknown>;
const nOuNull = (v: unknown) => (v == null ? null : Number(v));
const umDoJoin = <T>(v: unknown): T | null => {
  const j = v as T | T[] | null;
  return Array.isArray(j) ? (j[0] ?? null) : (j ?? null);
};

export const COLS_CLIENTE =
  "id, tipo_pessoa, razao_social, nome_fantasia, cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, email, telefone, telefone_ddi, endereco, cnae, porte, status, situacao_cadastral, optante_simples, flag_tem_folha, flag_contribui_icms, flag_contribui_iss, data_inicio, criado_em, atualizado_em";

export function serializarCliente(r: Row) {
  return {
    id: r.id,
    tipo_pessoa: r.tipo_pessoa,
    razao_social: r.razao_social,
    nome_fantasia: r.nome_fantasia ?? null,
    cpf_cnpj: r.cpf_cnpj ?? null,
    regime_tributario: r.regime_tributario,
    inscricao_estadual: r.inscricao_estadual ?? null,
    inscricao_municipal: r.inscricao_municipal ?? null,
    email: r.email ?? null,
    telefone: r.telefone ?? null,
    telefone_ddi: r.telefone_ddi ?? null,
    endereco: r.endereco ?? null,
    cnae: r.cnae ?? null,
    porte: r.porte ?? null,
    status: r.status,
    situacao_cadastral: r.situacao_cadastral ?? null,
    optante_simples: r.optante_simples ?? null,
    flags: {
      tem_folha: r.flag_tem_folha ?? null,
      contribui_icms: r.flag_contribui_icms ?? null,
      contribui_iss: r.flag_contribui_iss ?? null,
    },
    data_inicio: r.data_inicio ?? null,
    criado_em: r.criado_em,
    atualizado_em: r.atualizado_em,
  };
}

export const COLS_TITULO =
  "id, cliente_id, tipo, origem, descricao, valor, competencia, vencimento, status, criado_em, baixa(valor_recebido, estornada)";

export function serializarTitulo(r: Row) {
  const baixas = (Array.isArray(r.baixa) ? r.baixa : []) as { valor_recebido: unknown; estornada: unknown }[];
  const recebido = baixas.filter((b) => !b.estornada).reduce((s, b) => s + Number(b.valor_recebido), 0);
  return {
    id: r.id,
    cliente_id: r.cliente_id ?? null,
    tipo: r.tipo,
    origem: r.origem,
    descricao: r.descricao ?? null,
    valor: nOuNull(r.valor),
    recebido,
    competencia: r.competencia,
    vencimento: r.vencimento,
    status: r.status,
    criado_em: r.criado_em,
  };
}

export const COLS_BOLETO =
  "id, titulo_id, numero, nosso_numero, linha_digitavel, pix_copia_cola, url_pdf, valor, vencimento, status, criado_em";

export function serializarBoleto(r: Row) {
  return {
    id: r.id,
    titulo_id: r.titulo_id,
    numero: r.numero ?? null,
    nosso_numero: r.nosso_numero ?? null,
    linha_digitavel: r.linha_digitavel ?? null,
    pix_copia_cola: r.pix_copia_cola ?? null,
    url_pdf: r.url_pdf ?? null,
    valor: nOuNull(r.valor),
    vencimento: r.vencimento,
    status: r.status,
    criado_em: r.criado_em,
  };
}

export const COLS_OBRIGACAO =
  "id, cliente_id, competencia, vencimento_legal, vencimento_interno, status, entregue_em, criado_em, obrigacao(nome, codigo, esfera)";

export function serializarObrigacao(r: Row) {
  const o = umDoJoin<{ nome?: string; codigo?: string; esfera?: string }>(r.obrigacao);
  return {
    id: r.id,
    cliente_id: r.cliente_id ?? null,
    obrigacao: { nome: o?.nome ?? null, codigo: o?.codigo ?? null, esfera: o?.esfera ?? null },
    competencia: r.competencia,
    vencimento_legal: r.vencimento_legal ?? null,
    vencimento_interno: r.vencimento_interno ?? null,
    // "entregue" é derivado: não existe no enum (só pendente/dispensada).
    status: r.entregue_em ? "entregue" : r.status,
    entregue_em: r.entregue_em ?? null,
    criado_em: r.criado_em,
  };
}

export const COLS_DOCUMENTO = "id, cliente_id, nome, tipo, departamento, competencia, origem, enviado_em, substitui_id";

export function serializarDocumento(r: Row) {
  return {
    id: r.id,
    cliente_id: r.cliente_id,
    nome: r.nome,
    tipo: r.tipo ?? null,
    departamento: r.departamento ?? null,
    competencia: r.competencia ?? null,
    origem: r.origem ?? null,
    enviado_em: r.enviado_em,
    substitui_id: r.substitui_id ?? null,
  };
}
