import { emailValido } from "@/lib/email/validacao";

export type Filtro = {
  regimes?: string[];
  tipos?: string[];
  status?: string[];
  uf?: string | null;
  cidade?: string | null;
  contadorId?: string | null;
  departamento?: string | null;
  responsavelId?: string | null;
};

export type ClienteAlvo = {
  id: string;
  razaoSocial: string;
  email: string | null;
  telefone: string | null;
  cpfCnpj: string | null;
  regime: string | null;
  tipo: string;
  status: string;
  cidade: string | null;
  uf: string | null;
  contadorId: string | null;
  aceitaComunicados: boolean;
};

export type Excluido = { cliente: ClienteAlvo; motivo: string };

// Disparo em massa por WhatsApp é gatilho de banimento do número pela Meta (canal não
// oficial). Perder o número derruba o atendimento E a régua de cobrança.
export const TETO_WHATSAPP = 50;

// O endereço é digitado à mão: "GOIANIA", "Goiânia" e "goiania" convivem no cadastro.
// Comparar texto puro deixaria clientes de fora em silêncio.
const chave = (s: string | null | undefined): string =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Critérios combinam com E; cada critério, internamente, com OU ("Simples ou MEI").
export function aplicarFiltro(clientes: ClienteAlvo[], f: Filtro): ClienteAlvo[] {
  return clientes.filter((c) => {
    if (f.regimes?.length && !f.regimes.includes(c.regime ?? "")) return false;
    if (f.tipos?.length && !f.tipos.includes(c.tipo)) return false;
    if (f.status?.length && !f.status.includes(c.status)) return false;
    if (f.uf && chave(c.uf) !== chave(f.uf)) return false;
    if (f.cidade && chave(c.cidade) !== chave(f.cidade)) return false;
    if (f.contadorId && c.contadorId !== f.contadorId) return false;
    return true;
  });
}

export function descreverFiltro(f: Filtro): string {
  const partes: string[] = [];
  if (f.regimes?.length) partes.push(f.regimes.join(" ou "));
  if (f.tipos?.length) partes.push(f.tipos.join(" ou "));
  if (f.status?.length) partes.push(f.status.join(" ou "));
  if (f.cidade || f.uf) partes.push([f.cidade, f.uf].filter(Boolean).join("/"));
  if (f.contadorId) partes.push("contador específico");
  if (f.responsavelId) partes.push("responsável específico");
  return partes.length === 0 ? "Toda a base" : partes.join(" · ");
}

// Separa quem recebe de quem fica de fora — COM O MOTIVO. A prévia mostra os dois,
// porque "por que fulano não recebeu?" é a primeira pergunta depois de um disparo.
export function elegiveis(
  clientes: ClienteAlvo[],
  canal: "email" | "whatsapp",
): { destinatarios: ClienteAlvo[]; excluidos: Excluido[] } {
  const destinatarios: ClienteAlvo[] = [];
  const excluidos: Excluido[] = [];

  for (const c of clientes) {
    if (!c.aceitaComunicados) {
      excluidos.push({ cliente: c, motivo: "Não aceita comunicados" });
      continue;
    }
    if (canal === "email") {
      // E-mail malformado no cadastro é "sem e-mail" — não vira erro de envio depois.
      if (!c.email || !emailValido(c.email)) {
        excluidos.push({ cliente: c, motivo: "Sem e-mail cadastrado" });
        continue;
      }
    } else if (!c.telefone) {
      excluidos.push({ cliente: c, motivo: "Sem telefone cadastrado" });
      continue;
    }
    destinatarios.push(c);
  }

  return { destinatarios, excluidos };
}
