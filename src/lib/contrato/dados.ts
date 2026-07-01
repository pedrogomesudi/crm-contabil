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

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Primeira letra de cada palavra em maiúscula, o resto minúsculo.
function tituloCaso(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();
}

function enderecoLinha(e: Record<string, string> | null): string {
  if (!e) return "";
  const uf = (e.uf ?? "").toUpperCase();
  const cidadeUf = e.cidade && uf ? `${tituloCaso(e.cidade)}/${uf}` : (tituloCaso(e.cidade ?? "") || uf);
  return [
    tituloCaso(e.logradouro ?? ""),
    e.numero ?? "",
    tituloCaso(e.complemento ?? ""),
    tituloCaso(e.bairro ?? ""),
    cidadeUf,
  ]
    .filter(Boolean)
    .join(", ");
}

// "YYYY-MM-DD" -> "DD/MM/AAAA" sem new Date() (evita deslocamento de fuso).
function dataBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

// "YYYY-MM-DD" -> "DD de <mês> de AAAA".
function dataExtenso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  const mes = MESES[Number(m[2]) - 1] ?? "";
  return `${m[3]} de ${mes} de ${m[1]}`;
}

export function montarDadosContrato(
  cliente: ClienteContrato,
  honorarioMensal: number | null,
  vigenciaInicio: string,
  dataAssinatura: string,
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
    data_assinatura: dataExtenso(dataAssinatura),
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
