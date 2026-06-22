import { z } from "zod";
import { validarDocumento } from "./documento";
import {
  TIPOS_PESSOA,
  REGIMES,
  STATUS_CLIENTE,
  type TipoPessoa,
  type RegimeTributario,
} from "@/lib/tipos";

const combinacoes: Record<TipoPessoa, RegimeTributario[]> = {
  PJ: ["Simples", "Presumido", "Real"],
  PF: ["Isento/PF"],
  MEI: ["MEI"],
};

export const clienteSchema = z
  .object({
    tipo_pessoa: z.enum(TIPOS_PESSOA, { message: "Tipo de pessoa inválido" }),
    razao_social: z.string().trim().min(1, "Razão social/nome é obrigatório").max(200),
    nome_fantasia: z.string().trim().max(200).optional(),
    cpf_cnpj: z.string().trim().min(1, "CPF/CNPJ é obrigatório").max(20),
    regime_tributario: z.enum(REGIMES, { message: "Regime tributário inválido" }),
    inscricao_estadual: z.string().trim().max(30).optional(),
    inscricao_municipal: z.string().trim().max(30).optional(),
    email: z.union([z.email("E-mail inválido").max(120), z.literal("")]).optional(),
    telefone: z.string().trim().max(30).optional(),
    responsavel_nome: z.string().trim().max(120).optional(),
    observacoes: z.string().max(2000).optional(),
    // Campos persistidos que vêm do formulário — sem eles o Zod os descartaria.
    contador_id: z.union([z.uuid("Selecione um contador"), z.literal("")]).optional(),
    data_inicio: z
      .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"), z.literal("")])
      .optional(),
    status: z.enum(STATUS_CLIENTE).optional(),
    // endereco (jsonb) é montado à parte na action a partir de campos planos do form.
  })
  .refine((d) => validarDocumento(d.tipo_pessoa, d.cpf_cnpj), {
    path: ["cpf_cnpj"],
    message: "CPF/CNPJ inválido para o tipo selecionado",
  })
  .refine((d) => combinacoes[d.tipo_pessoa].includes(d.regime_tributario), {
    path: ["regime_tributario"],
    message: "Regime incompatível com o tipo de pessoa",
  });

export type ClienteInput = z.infer<typeof clienteSchema>;
