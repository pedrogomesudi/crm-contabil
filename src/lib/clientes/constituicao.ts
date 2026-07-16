import { validarDocumento } from "@/lib/validation/documento";

const REGIMES = new Set(["Simples", "Presumido", "Real"]);

export type SocioInput = {
  nome: string;
  cpf: string | null;
  participacao: string | null;
  papelSocietario: "administrador" | "quotista" | null;
  nascimento?: string | null;
  identidade?: string | null;
  estadoCivil?: string | null;
  endereco?: string | null;
  telefone?: string | null;
  email?: string | null;
};
export type DadosConstituicao = {
  razaoSocial: string;
  nomeFantasia: string | null;
  regime: string;
  endereco: Record<string, string> | null;
  observacoes: string | null;
  socios: SocioInput[];
  representante: Record<string, string> | null;
};

export function normalizarConstituicao(fd: FormData): DadosConstituicao | { erro: string } {
  const t = (k: string, max = 200) =>
    String(fd.get(k) ?? "")
      .trim()
      .slice(0, max);
  const razaoSocial = t("razao_social");
  if (!razaoSocial) return { erro: "Informe a razão social pretendida." };
  const regime = t("regime");
  if (!REGIMES.has(regime)) return { erro: "Regime pretendido inválido." };

  const endereco: Record<string, string> = {};
  for (const c of ["logradouro", "numero", "bairro", "cidade", "uf", "cep"]) {
    let v = t(c, 120);
    if (c === "uf") v = v.toUpperCase().slice(0, 2);
    if (v) endereco[c] = v;
  }

  let socios: SocioInput[] = [];
  try {
    const raw = JSON.parse(String(fd.get("socios") ?? "[]"));
    if (Array.isArray(raw)) {
      socios = raw
        .filter((s) => s && typeof s.nome === "string" && s.nome.trim())
        .map((s) => ({
          nome: String(s.nome).trim().slice(0, 160),
          cpf: s.cpf ? String(s.cpf).replace(/\D/g, "") || null : null,
          participacao: s.participacao ? String(s.participacao).slice(0, 20) : null,
          papelSocietario:
            s.papelSocietario === "administrador"
              ? "administrador"
              : s.papelSocietario === "quotista"
                ? "quotista"
                : null,
          nascimento: s.nascimento ?? null,
          identidade: s.identidade ?? null,
          estadoCivil: s.estadoCivil ?? null,
          endereco: s.endereco ?? null,
          telefone: s.telefone ?? null,
          email: s.email ?? null,
        }));
    }
  } catch {
    socios = [];
  }

  const admin = socios.find((s) => s.papelSocietario === "administrador") ?? socios[0] ?? null;
  const representante = admin ? { nome: admin.nome } : null;

  return {
    razaoSocial,
    nomeFantasia: t("nome_fantasia") || null,
    regime,
    endereco: Object.keys(endereco).length ? endereco : null,
    observacoes: t("observacoes", 2000) || null,
    socios,
    representante,
  };
}

export function validarAtivacao(cpfCnpj: string, regime: string): { erro?: string } {
  const d = cpfCnpj.replace(/\D/g, "");
  if (!validarDocumento("PJ", d)) return { erro: "CNPJ inválido." };
  if (!REGIMES.has(regime)) return { erro: "Regime inválido." };
  return {};
}
