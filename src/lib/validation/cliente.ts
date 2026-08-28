import { z } from "zod";
import { validarDocumento } from "./documento";
import { ehDataValida } from "./data";
import { TIPOS_PESSOA, REGIMES, STATUS_CLIENTE, PORTES, type TipoPessoa, type RegimeTributario } from "@/lib/tipos";

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
    porte: z.preprocess((v) => (v === "" || v == null ? undefined : v), z.enum(PORTES).optional()),
    inscricao_estadual: z.string().trim().max(30).optional(),
    inscricao_municipal: z.string().trim().max(30).optional(),
    email: z.union([z.email("E-mail inválido").max(120), z.literal("")]).optional(),
    telefone: z.string().trim().max(30).optional(),
    telefone_ddi: z.string().trim().max(4).optional(),
    // Contato secundário (2º e-mail / 2º telefone) + escolha, por contato, de usar no envio.
    // Os flags vêm do form como "on"/"off"; ausentes (API pública) ficam undefined → null → o
    // helper de envio aplica o default (principal ligado, 2º desligado).
    email_2: z.union([z.email("E-mail 2 inválido").max(120), z.literal("")]).optional(),
    telefone_2: z.string().trim().max(30).optional(),
    telefone_ddi_2: z.string().trim().max(4).optional(),
    email_envio: z
      .preprocess((v) => (v === undefined ? undefined : v === "on" || v === "1" || v === true), z.boolean().optional())
      .optional(),
    email_2_envio: z
      .preprocess((v) => (v === undefined ? undefined : v === "on" || v === "1" || v === true), z.boolean().optional())
      .optional(),
    whatsapp_envio: z
      .preprocess((v) => (v === undefined ? undefined : v === "on" || v === "1" || v === true), z.boolean().optional())
      .optional(),
    whatsapp_2_envio: z
      .preprocess((v) => (v === undefined ? undefined : v === "on" || v === "1" || v === true), z.boolean().optional())
      .optional(),
    responsavel_nome: z.string().trim().max(120).optional(),
    observacoes: z.string().max(2000).optional(),
    // Campos persistidos que vêm do formulário — sem eles o Zod os descartaria.
    contador_id: z.union([z.uuid("Selecione um contador"), z.literal("")]).optional(),
    data_inicio: z.union([z.string().refine(ehDataValida, "Data inválida"), z.literal("")]).optional(),
    status: z.enum(STATUS_CLIENTE).optional(),
    // Canal de recebimento dos honorários. Persistido em clientes_financeiro (não em
    // clientes) — a gravação o remove do payload de clientes e faz upsert dos flags.
    canal_cobranca: z.enum(["whatsapp", "email", "ambos"]).default("ambos"),
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
