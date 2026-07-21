export const ESCOPOS_API = [
  "clientes:read",
  "clientes:write",
  "titulos:read",
  "titulos:write",
  "obrigacoes:read",
  "obrigacoes:write",
  "documentos:read",
  "documentos:write",
] as const;
export type EscopoApi = (typeof ESCOPOS_API)[number];
