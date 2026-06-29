import type { RegimeTributario, StatusCliente, TipoPessoa } from "@/lib/tipos";
import { validarCNPJ, validarCPF } from "@/lib/validation/documento";
import { soDigitos } from "@/lib/format";
import type { EmpresaDominio, ContatoDominio, EnderecoDominio } from "./tipos";

export type ClienteNormalizado = {
  cpf_cnpj: string;
  tipo_pessoa: TipoPessoa;
  razao_social: string;
  nome_fantasia: string | null;
  regime_tributario: RegimeTributario | null;
  status: StatusCliente;
  cnae: string | null;
  inscricao_estadual: string | null;
  endereco: EnderecoDominio | null;
  email: string | null;
  telefone: string | null;
  dominio_codigo: string | null;
  pendencias: string[];
};

// Mapeia o regime federal do Domínio para o enum do CRM (apenas regimes de PJ).
export function mapearRegime(regimeDominio: string): { regime: RegimeTributario | null; pendencia: string | null } {
  const r = regimeDominio.toLowerCase();
  if (r.includes("microempresa") || r.includes("simples") || r.includes("epp"))
    return { regime: "Simples", pendencia: null };
  if (r.includes("presumido")) return { regime: "Presumido", pendencia: null };
  if (r.includes("real")) return { regime: "Real", pendencia: null };
  return { regime: null, pendencia: `Regime "${regimeDominio}" sem equivalente — revisar` };
}

export function mapearStatus(status: string): StatusCliente {
  return status.trim().toLowerCase().startsWith("inativa") ? "inativo" : "ativo";
}

// Classifica PF/PJ pelo documento, validando dígitos verificadores (reusa os
// validadores da V1). null quando o documento é inválido.
export function tipoPessoaPorDoc(doc: string): TipoPessoa | null {
  if (validarCNPJ(doc)) return "PJ";
  if (validarCPF(doc)) return "PF";
  return null;
}

// Garante um par tipo_pessoa × regime_tributario VÁLIDO segundo o CHECK do banco
// (PJ→Simples/Presumido/Real, PF→Isento/PF, MEI→MEI). Documento inválido ou
// regime sem equivalente geram pendência (não viram INSERT).
function classificar(doc: string, regimeDominio: string): {
  tipo_pessoa: TipoPessoa;
  regime_tributario: RegimeTributario | null;
  pendencias: string[];
} {
  const ehMei = /\bmei\b|microempreendedor/.test(regimeDominio.toLowerCase());
  if (validarCNPJ(doc)) {
    if (ehMei) return { tipo_pessoa: "MEI", regime_tributario: "MEI", pendencias: [] };
    const { regime, pendencia } = mapearRegime(regimeDominio);
    return { tipo_pessoa: "PJ", regime_tributario: regime, pendencias: pendencia ? [pendencia] : [] };
  }
  if (validarCPF(doc)) {
    return { tipo_pessoa: "PF", regime_tributario: "Isento/PF", pendencias: [] };
  }
  return {
    tipo_pessoa: "PJ",
    regime_tributario: null,
    pendencias: [`Documento inválido: ${doc || "(vazio)"} — revisar`],
  };
}

export function combinarFontes(empresas: EmpresaDominio[], contatos: ContatoDominio[]): ClienteNormalizado[] {
  const porCnpj = new Map<string, ContatoDominio>();
  for (const c of contatos) {
    const d = soDigitos(c.cnpj);
    if (d) porCnpj.set(d, c);
  }

  const out: ClienteNormalizado[] = [];
  const usados = new Set<string>();
  for (const e of empresas) {
    const doc = soDigitos(e.cnpj);
    const contato = porCnpj.get(doc) ?? null;
    if (contato) usados.add(doc);
    const { tipo_pessoa, regime_tributario, pendencias } = classificar(doc, e.regimeDominio);
    out.push({
      cpf_cnpj: doc,
      tipo_pessoa,
      razao_social: e.razaoSocial,
      nome_fantasia: contato?.apelido ?? null,
      regime_tributario,
      status: mapearStatus(e.status),
      cnae: e.cnae,
      inscricao_estadual: e.inscricaoEstadual,
      endereco: contato?.endereco ?? null,
      email: contato?.email ?? null,
      telefone: contato?.telefone ?? null,
      dominio_codigo: contato ? String(contato.codigo) : null,
      pendencias,
    });
  }

  // Clientes que existem só no Honorários (sem empresa correspondente): não são
  // descartados — viram pendência para revisão (não perder dado silenciosamente).
  for (const c of contatos) {
    const doc = soDigitos(c.cnpj);
    if (!doc || usados.has(doc)) continue;
    out.push({
      cpf_cnpj: doc,
      tipo_pessoa: tipoPessoaPorDoc(doc) ?? "PJ",
      razao_social: c.nome,
      nome_fantasia: c.apelido,
      regime_tributario: null,
      status: "ativo",
      cnae: null,
      inscricao_estadual: null,
      endereco: c.endereco,
      email: c.email,
      telefone: c.telefone,
      dominio_codigo: String(c.codigo),
      pendencias: ["Cliente sem empresa correspondente no Cadastro de Empresas — revisar"],
    });
  }
  return out;
}
