export type EndpointDoc = {
  metodo: "GET" | "POST" | "PATCH";
  caminho: string;
  escopo?: string;
  resumo: string;
  params?: { nome: string; em: "query" | "path"; descricao: string }[];
  multipart?: boolean;
  recurso?: "Cliente" | "Titulo" | "Boleto" | "Obrigacao" | "Documento";
  lista?: boolean;
  bodySchema?: string;
};

const paginacao = [
  { nome: "limit", em: "query" as const, descricao: "Máximo por página (default 50, máx 200)." },
  { nome: "offset", em: "query" as const, descricao: "Deslocamento para paginação." },
];
const idPath = [{ nome: "id", em: "path" as const, descricao: "UUID do recurso." }];

export const ENDPOINTS: EndpointDoc[] = [
  { metodo: "GET", caminho: "/ping", resumo: "Testa a credencial; devolve os escopos da chave." },
  {
    metodo: "GET",
    caminho: "/clientes",
    escopo: "clientes:read",
    resumo: "Lista clientes.",
    recurso: "Cliente",
    lista: true,
    params: [
      ...paginacao,
      { nome: "cpf_cnpj", em: "query", descricao: "Filtra por CNPJ (só dígitos)." },
      { nome: "status", em: "query", descricao: "ativo | inativo." },
    ],
  },
  {
    metodo: "POST",
    caminho: "/clientes",
    escopo: "clientes:write",
    resumo: "Cria um cliente (corpo = objeto de cliente; endereco opcional).",
    recurso: "Cliente",
    bodySchema: "ClienteInput",
  },
  {
    metodo: "GET",
    caminho: "/clientes/{id}",
    escopo: "clientes:read",
    resumo: "Detalha um cliente.",
    recurso: "Cliente",
    params: idPath,
  },
  {
    metodo: "PATCH",
    caminho: "/clientes/{id}",
    escopo: "clientes:write",
    resumo: "Edita um cliente (exige campo atualizado_em para concorrência).",
    recurso: "Cliente",
    bodySchema: "ClienteInput",
    params: idPath,
  },
  {
    metodo: "GET",
    caminho: "/titulos",
    escopo: "titulos:read",
    resumo: "Lista títulos.",
    recurso: "Titulo",
    lista: true,
    params: [
      ...paginacao,
      { nome: "cliente_id", em: "query", descricao: "Filtra por cliente." },
      { nome: "status", em: "query", descricao: "ABERTO | BAIXADO | ..." },
      { nome: "competencia", em: "query", descricao: "AAAA-MM-DD." },
      { nome: "tipo", em: "query", descricao: "RECEBER | PAGAR." },
    ],
  },
  {
    metodo: "POST",
    caminho: "/titulos",
    escopo: "titulos:write",
    resumo: "Cria uma cobrança avulsa (clienteId, valor, vencimento, categoriaId, descricao).",
    recurso: "Titulo",
    bodySchema: "TituloInput",
  },
  {
    metodo: "GET",
    caminho: "/titulos/{id}",
    escopo: "titulos:read",
    resumo: "Detalha um título.",
    recurso: "Titulo",
    params: idPath,
  },
  {
    metodo: "POST",
    caminho: "/titulos/{id}/baixa",
    escopo: "titulos:write",
    resumo: "Registra um recebimento (valorRecebido, dataRecebimento, contaBancariaId, formaPagamento).",
    bodySchema: "BaixaInput",
    params: idPath,
  },
  {
    metodo: "GET",
    caminho: "/boletos",
    escopo: "titulos:read",
    resumo: "Lista boletos.",
    recurso: "Boleto",
    lista: true,
    params: [
      ...paginacao,
      { nome: "titulo_id", em: "query", descricao: "Filtra por título." },
      { nome: "status", em: "query", descricao: "emitido | pago | cancelado | erro." },
    ],
  },
  {
    metodo: "GET",
    caminho: "/obrigacoes",
    escopo: "obrigacoes:read",
    resumo: "Lista obrigações.",
    recurso: "Obrigacao",
    lista: true,
    params: [
      ...paginacao,
      { nome: "cliente_id", em: "query", descricao: "Filtra por cliente." },
      { nome: "competencia", em: "query", descricao: "AAAA-MM-DD." },
      { nome: "entregue", em: "query", descricao: "true | false." },
    ],
  },
  {
    metodo: "GET",
    caminho: "/obrigacoes/{id}",
    escopo: "obrigacoes:read",
    resumo: "Detalha uma obrigação.",
    recurso: "Obrigacao",
    params: idPath,
  },
  {
    metodo: "PATCH",
    caminho: "/obrigacoes/{id}",
    escopo: "obrigacoes:write",
    resumo: "Marca a obrigação como entregue (data, observacao; comprovante via multipart).",
    params: idPath,
    multipart: true,
  },
  {
    metodo: "GET",
    caminho: "/documentos",
    escopo: "documentos:read",
    resumo: "Lista documentos (metadados).",
    recurso: "Documento",
    lista: true,
    params: [
      ...paginacao,
      { nome: "cliente_id", em: "query", descricao: "Filtra por cliente." },
      { nome: "tipo", em: "query", descricao: "Filtra por tipo." },
      { nome: "competencia", em: "query", descricao: "AAAA-MM-DD." },
    ],
  },
  {
    metodo: "POST",
    caminho: "/documentos",
    escopo: "documentos:write",
    resumo: "Envia um documento (multipart: cliente_id, arquivo, tipo_id?, departamento?, competencia?).",
    multipart: true,
  },
];

const nul = (t: string) => ({ type: [t, "null"] });
const SCHEMAS: Record<string, unknown> = {
  Paginacao: {
    type: "object",
    properties: { limit: { type: "integer" }, offset: { type: "integer" }, total: { type: "integer" } },
  },
  Erro: {
    type: "object",
    properties: {
      erro: { type: "object", properties: { codigo: { type: "string" }, mensagem: { type: "string" } } },
    },
  },
  Cliente: {
    type: "object",
    properties: {
      id: { type: "string" },
      tipo_pessoa: { type: "string" },
      razao_social: { type: "string" },
      nome_fantasia: nul("string"),
      cpf_cnpj: nul("string"),
      regime_tributario: { type: "string" },
      inscricao_estadual: nul("string"),
      inscricao_municipal: nul("string"),
      email: nul("string"),
      telefone: nul("string"),
      telefone_ddi: nul("string"),
      endereco: nul("object"),
      cnae: nul("string"),
      porte: nul("string"),
      status: { type: "string" },
      situacao_cadastral: nul("string"),
      optante_simples: nul("boolean"),
      flags: {
        type: "object",
        properties: { tem_folha: nul("boolean"), contribui_icms: nul("boolean"), contribui_iss: nul("boolean") },
      },
      data_inicio: nul("string"),
      criado_em: { type: "string" },
      atualizado_em: { type: "string" },
    },
  },
  Titulo: {
    type: "object",
    properties: {
      id: { type: "string" },
      cliente_id: nul("string"),
      tipo: { type: "string" },
      origem: { type: "string" },
      descricao: nul("string"),
      valor: nul("number"),
      recebido: { type: "number" },
      competencia: { type: "string" },
      vencimento: { type: "string" },
      status: { type: "string" },
      criado_em: { type: "string" },
    },
  },
  Boleto: {
    type: "object",
    properties: {
      id: { type: "string" },
      titulo_id: { type: "string" },
      numero: nul("integer"),
      nosso_numero: nul("string"),
      linha_digitavel: nul("string"),
      pix_copia_cola: nul("string"),
      url_pdf: nul("string"),
      valor: nul("number"),
      vencimento: { type: "string" },
      status: { type: "string" },
      criado_em: { type: "string" },
    },
  },
  Obrigacao: {
    type: "object",
    properties: {
      id: { type: "string" },
      cliente_id: nul("string"),
      obrigacao: {
        type: "object",
        properties: { nome: nul("string"), codigo: nul("string"), esfera: nul("string") },
      },
      competencia: { type: "string" },
      vencimento_legal: nul("string"),
      vencimento_interno: nul("string"),
      status: { type: "string" },
      entregue_em: nul("string"),
      criado_em: { type: "string" },
    },
  },
  Documento: {
    type: "object",
    properties: {
      id: { type: "string" },
      cliente_id: { type: "string" },
      nome: { type: "string" },
      tipo: nul("string"),
      departamento: nul("string"),
      competencia: nul("string"),
      origem: nul("string"),
      enviado_em: { type: "string" },
      substitui_id: nul("string"),
    },
  },
  ClienteInput: {
    type: "object",
    required: ["tipo_pessoa", "razao_social", "cpf_cnpj", "regime_tributario"],
    properties: {
      tipo_pessoa: { type: "string", enum: ["PJ", "PF", "MEI"] },
      razao_social: { type: "string" },
      cpf_cnpj: { type: "string" },
      regime_tributario: { type: "string" },
      email: { type: "string" },
      telefone: { type: "string" },
      endereco: { type: "object" },
      atualizado_em: { type: "string", description: "Obrigatório no PATCH (controle de concorrência)." },
    },
  },
  TituloInput: {
    type: "object",
    required: ["clienteId", "valor", "vencimento", "categoriaId"],
    properties: {
      clienteId: { type: "string" },
      valor: { type: "number" },
      vencimento: { type: "string" },
      categoriaId: { type: "string" },
      descricao: { type: "string" },
    },
  },
  BaixaInput: {
    type: "object",
    required: ["valorRecebido", "dataRecebimento", "contaBancariaId", "formaPagamento"],
    properties: {
      valorRecebido: { type: "number" },
      dataRecebimento: { type: "string" },
      juros: { type: "number" },
      multa: { type: "number" },
      desconto: { type: "number" },
      contaBancariaId: { type: "string" },
      formaPagamento: { type: "string" },
    },
  },
};

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const respLista = (r: string) => ({
  type: "object",
  properties: { dados: { type: "array", items: ref(r) }, paginacao: ref("Paginacao") },
});
const respItem = (r: string) => ({ type: "object", properties: { dados: ref(r) } });

export function documentoOpenApi(): object {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const resp200 = e.recurso
      ? {
          description: "OK",
          content: { "application/json": { schema: e.lista ? respLista(e.recurso) : respItem(e.recurso) } },
        }
      : { description: "OK" };
    const op: Record<string, unknown> = {
      summary: e.resumo,
      security: [{ apiKey: [] }],
      parameters: (e.params ?? []).map((p) => ({
        name: p.nome,
        in: p.em,
        required: p.em === "path",
        schema: { type: "string" },
        description: p.descricao,
      })),
      responses: {
        "200": resp200,
        "401": {
          description: "API key ausente ou inválida.",
          content: { "application/json": { schema: ref("Erro") } },
        },
        ...(e.escopo
          ? {
              "403": {
                description: `Escopo necessário: ${e.escopo}.`,
                content: { "application/json": { schema: ref("Erro") } },
              },
            }
          : {}),
      },
    };
    if (e.escopo) op["x-escopo"] = e.escopo;
    if (e.multipart) op["requestBody"] = { content: { "multipart/form-data": { schema: { type: "object" } } } };
    else if (e.bodySchema) op["requestBody"] = { content: { "application/json": { schema: ref(e.bodySchema) } } };
    paths[e.caminho] = { ...(paths[e.caminho] ?? {}), [e.metodo.toLowerCase()]: op };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "SALDO API",
      version: "1",
      description: "API pública do SALDO. Autentique com Authorization: Bearer <api_key>.",
    },
    servers: [{ url: "/api/v1" }],
    components: {
      securitySchemes: {
        apiKey: { type: "http", scheme: "bearer", description: "API key gerada em Configurações → API pública." },
      },
      schemas: SCHEMAS,
    },
    security: [{ apiKey: [] }],
    paths,
  };
}
