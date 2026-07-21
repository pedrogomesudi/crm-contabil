import { z } from "zod";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve ser YYYY-MM-DD");

export const tituloAvulsoSchema = z.object({
  clienteId: z.uuid("clienteId inválido"),
  valor: z.number().positive("valor deve ser > 0"),
  vencimento: dataIso,
  categoriaId: z.uuid("categoriaId inválido"),
  descricao: z.string().trim().max(300).optional().default(""),
});
export type TituloAvulsoInput = z.infer<typeof tituloAvulsoSchema>;

export const baixaSchema = z.object({
  tituloId: z.uuid(),
  valorRecebido: z.number().positive(),
  dataRecebimento: dataIso,
  juros: z.number().min(0).optional().default(0),
  multa: z.number().min(0).optional().default(0),
  desconto: z.number().min(0).optional().default(0),
  contaBancariaId: z.uuid(),
  formaPagamento: z.string().min(1),
});
export type BaixaApiInput = z.infer<typeof baixaSchema>;

export const documentoMetaSchema = z.object({
  tipoId: z.uuid().optional(),
  departamento: z.string().trim().optional(),
  competencia: z.string().trim().optional(),
  tipo: z.string().trim().max(60).optional(),
});

export const obrigacaoBaixaSchema = z.object({
  data: dataIso.optional(),
  observacao: z.string().trim().max(2000).optional(),
});
