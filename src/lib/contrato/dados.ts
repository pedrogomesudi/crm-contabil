import { formatarDocumento, formatarCep, formatarMoeda } from "@/lib/format";
import { reaisPorExtenso } from "./extenso";

export type ClienteContrato = {
  razao_social: string;
  cpf_cnpj: string;
  endereco: Record<string, string> | null;
  email: string | null;
  telefone: string | null;
  responsavel_nome: string | null;
  representante: Record<string, string> | null;
};

function enderecoLinha(e: Record<string, string> | null): string {
  if (!e) return "";
  const cidadeUf = e.cidade && e.uf ? `${e.cidade}/${e.uf}` : (e.cidade ?? e.uf ?? "");
  return [e.logradouro, e.numero, e.complemento, e.bairro, cidadeUf].filter(Boolean).join(", ");
}

// "YYYY-MM-DD" -> "DD/MM/AAAA" sem new Date() (evita deslocamento de fuso).
function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function montarDadosContrato(
  cliente: ClienteContrato,
  honorarioMensal: number | null,
  vigenciaInicio: string,
): { dados: Record<string, string>; faltando: string[] } {
  const rep = cliente.representante ?? {};
  const end = cliente.endereco ?? {};
  const dados: Record<string, string> = {
    razao_social: cliente.razao_social ?? "",
    cnpj: cliente.cpf_cnpj ? formatarDocumento(cliente.cpf_cnpj) : "",
    endereco: enderecoLinha(cliente.endereco),
    cep: end.cep ? formatarCep(end.cep) : "",
    email: cliente.email ?? "",
    telefone: cliente.telefone ?? "",
    rep_nome: cliente.responsavel_nome ?? "",
    rep_nacionalidade: rep.nacionalidade ?? "",
    rep_estado_civil: rep.estado_civil ?? "",
    rep_profissao: rep.profissao ?? "",
    rep_rg: rep.rg ?? "",
    rep_cpf: rep.cpf ? formatarDocumento(rep.cpf) : "",
    honorario: honorarioMensal != null ? formatarMoeda(honorarioMensal) : "",
    honorario_extenso: honorarioMensal != null ? reaisPorExtenso(honorarioMensal) : "",
    vigencia_inicio: dataBR(vigenciaInicio),
  };
  const obrig: [string, string][] = [
    ["razao_social", "Razão social"],
    ["cnpj", "CNPJ"],
    ["endereco", "Endereço"],
    ["rep_nome", "Nome do representante"],
    ["rep_nacionalidade", "Nacionalidade"],
    ["rep_estado_civil", "Estado civil"],
    ["rep_profissao", "Profissão"],
    ["rep_rg", "RG do representante"],
    ["rep_cpf", "CPF do representante"],
    ["honorario", "Honorário"],
  ];
  const faltando = obrig.filter(([k]) => !dados[k]).map(([, label]) => label);
  return { dados, faltando };
}
