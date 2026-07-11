import { totaisProposta } from "@/lib/comercial/proposta";

export type DadosTags = {
  proposta: { numero: number; validade: string | null; observacoes: string | null };
  cliente: { nome: string; contato: string | null };
  itens: { descricao: string; valor: number; recorrencia: "mensal" | "unico" }[];
  marca: { nome: string | null; cnpj: string | null; email: string | null; telefone: string | null; endereco: Record<string, string> | null };
  responsavel: { nome: string | null; email: string | null; telefone: string | null };
  hoje: string; // ISO yyyy-mm-dd (calculado server-side)
};

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function formatarBRL(v: number): string {
  // Intl insere espaço não-quebrável após "R$"; normaliza p/ espaço comum (previsível no template/PDF).
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/[\u00a0\u202f]/g, " ");
}
export function formatarDataBR(iso: string | null): string {
  if (!iso) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
export function formatarMesAno(iso: string): string {
  const mes = MESES[Number(iso.slice(5, 7)) - 1] ?? "";
  return `${mes}/${iso.slice(0, 4)}`;
}
function formatarCnpj(d: string | null): string {
  if (!d) return "";
  const s = d.replace(/\D/g, "");
  if (s.length !== 14) return d;
  return `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
}
export function formatarEnderecoLinha(e: Record<string, string> | null): string {
  if (!e) return "";
  const rua = [e.logradouro, e.numero].filter(Boolean).join(", ");
  const cidadeUf = [e.cidade, e.uf].filter(Boolean).join("/");
  return [rua, e.bairro, cidadeUf, e.cep].filter(Boolean).join(" · ");
}

export function montarMapaTags(d: DadosTags): { mapa: Record<string, string>; itens: { descricao: string; recorrencia: string; valor: string }[] } {
  const t = totaisProposta(d.itens);
  const itens = d.itens.map((i) => ({
    descricao: i.descricao,
    recorrencia: i.recorrencia === "mensal" ? "Mensal" : "Único",
    valor: formatarBRL(i.valor),
  }));
  const mapa: Record<string, string> = {
    nome_escritorio: d.marca.nome ?? "",
    cnpj_escritorio: formatarCnpj(d.marca.cnpj),
    email_escritorio: d.marca.email ?? "",
    telefone_escritorio: d.marca.telefone ?? "",
    endereco_escritorio: formatarEnderecoLinha(d.marca.endereco),
    nome_cliente: d.cliente.nome ?? "",
    contato_cliente: d.cliente.contato ?? "",
    numero_proposta: String(d.proposta.numero),
    data_emissao: formatarDataBR(d.hoje),
    mes_ano: formatarMesAno(d.hoje),
    validade: formatarDataBR(d.proposta.validade),
    condicoes: d.proposta.observacoes ?? "",
    responsavel_nome: d.responsavel.nome ?? "",
    responsavel_email: d.responsavel.email ?? "",
    responsavel_telefone: d.responsavel.telefone ?? "",
    total_mensal: formatarBRL(t.mensal),
    total_unico: formatarBRL(t.unico),
  };
  return { mapa, itens };
}

export function tagsNoTexto(texto: string): string[] {
  const set = new Set<string>();
  for (const m of texto.matchAll(/\{([#/]?\w+)\}/g)) {
    const raw = m[1];
    if (!raw || raw.startsWith("#") || raw.startsWith("/")) continue;
    set.add(raw);
  }
  return [...set];
}

export const TAGS_DISPONIVEIS: { tag: string; rotulo: string; grupo: string }[] = [
  { tag: "nome_escritorio", rotulo: "Nome do escritório", grupo: "Escritório" },
  { tag: "cnpj_escritorio", rotulo: "CNPJ do escritório", grupo: "Escritório" },
  { tag: "email_escritorio", rotulo: "E-mail do escritório", grupo: "Escritório" },
  { tag: "telefone_escritorio", rotulo: "Telefone do escritório", grupo: "Escritório" },
  { tag: "endereco_escritorio", rotulo: "Endereço do escritório", grupo: "Escritório" },
  { tag: "nome_cliente", rotulo: "Nome do cliente", grupo: "Cliente" },
  { tag: "contato_cliente", rotulo: "Contato do cliente", grupo: "Cliente" },
  { tag: "numero_proposta", rotulo: "Número da proposta", grupo: "Proposta" },
  { tag: "data_emissao", rotulo: "Data de emissão", grupo: "Proposta" },
  { tag: "mes_ano", rotulo: "Mês/ano", grupo: "Proposta" },
  { tag: "validade", rotulo: "Validade", grupo: "Proposta" },
  { tag: "condicoes", rotulo: "Condições (observações)", grupo: "Proposta" },
  { tag: "responsavel_nome", rotulo: "Responsável — nome", grupo: "Responsável" },
  { tag: "responsavel_email", rotulo: "Responsável — e-mail", grupo: "Responsável" },
  { tag: "responsavel_telefone", rotulo: "Responsável — telefone", grupo: "Responsável" },
  { tag: "total_mensal", rotulo: "Total mensal", grupo: "Totais" },
  { tag: "total_unico", rotulo: "Total único", grupo: "Totais" },
];
