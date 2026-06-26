import type { FolhaXls } from "./biff";
import type { TipoArquivoDominio } from "./tipos";

function textoDe(folha: FolhaXls, ateLinha = 12): string {
  return folha.celulas
    .slice(0, ateLinha)
    .flat()
    .map((c) => String(c ?? "").toLowerCase())
    .join("|");
}

export function detectarTipo(folha: FolhaXls): TipoArquivoDominio {
  const t = textoDe(folha);
  const temEmpresa = t.includes("empresa");
  if (t.includes("cnae") && t.includes("regime tribut") && temEmpresa) return "empresas";
  if (t.includes("tipo de contrato") || t.includes("relação de contratos")) return "contratos";
  if (t.includes("apelido:") || (t.includes("código:") && temEmpresa)) return "clientes";
  return "desconhecido";
}
