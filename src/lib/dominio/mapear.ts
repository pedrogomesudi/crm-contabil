import type { RegimeTributario, StatusCliente, TipoPessoa } from "@/lib/tipos";
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

export function tipoPessoaPorDoc(doc: string): TipoPessoa | null {
  if (doc.length === 14) return "PJ";
  if (doc.length === 11) return "PF";
  return null;
}

export function combinarFontes(empresas: EmpresaDominio[], contatos: ContatoDominio[]): ClienteNormalizado[] {
  const porCnpj = new Map<string, ContatoDominio>();
  for (const c of contatos) if (c.cnpj) porCnpj.set(c.cnpj, c);

  const out: ClienteNormalizado[] = [];
  for (const e of empresas) {
    const contato = porCnpj.get(e.cnpj) ?? null;
    const pend: string[] = [];
    const tipo = tipoPessoaPorDoc(e.cnpj);
    if (!tipo) pend.push("Documento inválido (não é CPF nem CNPJ)");
    const { regime, pendencia } = mapearRegime(e.regimeDominio);
    if (pendencia) pend.push(pendencia);
    out.push({
      cpf_cnpj: e.cnpj,
      tipo_pessoa: tipo ?? "PJ",
      razao_social: e.razaoSocial,
      nome_fantasia: contato?.apelido ?? null,
      regime_tributario: regime,
      status: mapearStatus(e.status),
      cnae: e.cnae,
      inscricao_estadual: e.inscricaoEstadual,
      endereco: contato?.endereco ?? null,
      email: contato?.email ?? null,
      telefone: contato?.telefone ?? null,
      dominio_codigo: contato ? String(contato.codigo) : null,
      pendencias: pend,
    });
  }
  return out;
}
