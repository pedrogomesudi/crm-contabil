import { ehDataValida } from "@/lib/validation/data";

export type CampoTipo = "texto" | "numero" | "data" | "booleano" | "lista";
export type CampoDef = { id: string; nome: string; tipo: CampoTipo; obrigatorio: boolean; opcoes: string[] };

type Ok = { ok: true; valores: Record<string, unknown>; faltando: string[] };

// Valida os valores crus do form (por campo id) contra o catálogo. Erros de TIPO bloqueiam sempre
// (retornam { erro }); campos obrigatórios vazios entram em `faltando` — quem consome decide se
// isso bloqueia (Fatia A ignora; Fatia B bloqueia). Devolve só os campos preenchidos.
export function validarCampos(defs: CampoDef[], crus: Record<string, string>): Ok | { erro: string } {
  const valores: Record<string, unknown> = {};
  const faltando: string[] = [];

  for (const d of defs) {
    const bruto = (crus[d.id] ?? "").trim();

    if (d.tipo === "booleano") {
      valores[d.id] = bruto !== ""; // checkbox: "on" quando marcado, "" quando não
      continue;
    }

    if (bruto === "") {
      if (d.obrigatorio) faltando.push(d.nome);
      continue; // vazio não entra no jsonb
    }

    switch (d.tipo) {
      case "numero": {
        const n = Number(bruto);
        if (!Number.isFinite(n)) return { erro: `O campo "${d.nome}" deve ser um número.` };
        valores[d.id] = n;
        break;
      }
      case "data": {
        if (!ehDataValida(bruto)) return { erro: `O campo "${d.nome}" tem uma data inválida.` };
        valores[d.id] = bruto;
        break;
      }
      case "lista": {
        if (!d.opcoes.includes(bruto)) return { erro: `Opção inválida para "${d.nome}".` };
        valores[d.id] = bruto;
        break;
      }
      default:
        valores[d.id] = bruto; // texto
    }
  }

  return { ok: true, valores, faltando };
}
