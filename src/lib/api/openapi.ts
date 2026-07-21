export type EndpointDoc = {
  metodo: "GET" | "POST" | "PATCH";
  caminho: string;
  escopo?: string;
  resumo: string;
  params?: { nome: string; em: "query" | "path"; descricao: string }[];
  multipart?: boolean;
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
  },
  { metodo: "GET", caminho: "/clientes/{id}", escopo: "clientes:read", resumo: "Detalha um cliente.", params: idPath },
  {
    metodo: "PATCH",
    caminho: "/clientes/{id}",
    escopo: "clientes:write",
    resumo: "Edita um cliente (exige campo atualizado_em para concorrência).",
    params: idPath,
  },
  {
    metodo: "GET",
    caminho: "/titulos",
    escopo: "titulos:read",
    resumo: "Lista títulos.",
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
  },
  { metodo: "GET", caminho: "/titulos/{id}", escopo: "titulos:read", resumo: "Detalha um título.", params: idPath },
  {
    metodo: "POST",
    caminho: "/titulos/{id}/baixa",
    escopo: "titulos:write",
    resumo: "Registra um recebimento (valorRecebido, dataRecebimento, contaBancariaId, formaPagamento).",
    params: idPath,
  },
  {
    metodo: "GET",
    caminho: "/boletos",
    escopo: "titulos:read",
    resumo: "Lista boletos.",
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

export function documentoOpenApi(): object {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
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
        "200": { description: "OK" },
        "401": { description: "API key ausente ou inválida." },
        ...(e.escopo ? { "403": { description: `Escopo necessário: ${e.escopo}.` } } : {}),
      },
    };
    if (e.escopo) op["x-escopo"] = e.escopo;
    if (e.multipart) op["requestBody"] = { content: { "multipart/form-data": { schema: { type: "object" } } } };
    else if (e.metodo === "POST" || e.metodo === "PATCH")
      op["requestBody"] = { content: { "application/json": { schema: { type: "object" } } } };
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
    },
    security: [{ apiKey: [] }],
    paths,
  };
}
