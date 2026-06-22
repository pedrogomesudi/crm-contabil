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
    razao_social: z.string().min(1, "Razão social/nome é obrigatório"),
    nome_fantasia: z.string().optional(),
    cpf_cnpj: z.string().min(1, "CPF/CNPJ é obrigatório"),
    regime_tributario: z.enum(REGIMES, { message: "Regime tributário inválido" }),
    inscricao_estadual: z.string().optional(),
    inscricao_municipal: z.string().optional(),
    email: z.union([z.email("E-mail inválido"), z.literal("")]).optional(),
    telefone: z.string().optional(),
    responsavel_nome: z.string().optional(),
    observacoes: z.string().optional(),
    // Campos persistidos que vêm do formulário — sem eles o Zod os descartaria.
    contador_id: z.union([z.uuid("Selecione um contador"), z.literal("")]).optional(),
    data_inicio: z.string().optional(),
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
