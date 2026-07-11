import { tagsNoTexto, TAGS_DISPONIVEIS } from "@/lib/comercial/proposta-template";

type Item = { descricao: string; recorrencia: string; valor: string };

// Expande {#itens}...{/itens} e substitui {tag}. Tags ausentes viram vazio.
export function renderHtml(template: string, mapa: Record<string, string>, itens: Item[]): string {
  const comLoop = template.replace(/\{#itens\}([\s\S]*?)\{\/itens\}/g, (_m, bloco: string) =>
    itens.map((it) => bloco.replace(/\{(\w+)\}/g, (_x, k: string) => (it as Record<string, string>)[k] ?? "")).join(""),
  );
  return comLoop.replace(/\{(\w+)\}/g, (_m, k: string) => mapa[k] ?? "");
}

// Remove vetores de execução: <script>, atributos on*, e URLs javascript:.
export function sanitizarHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

const CONHECIDAS = new Set([...TAGS_DISPONIVEIS.map((t) => t.tag), "descricao", "recorrencia", "valor"]);
const EXTERNO = /(?:src|href)\s*=\s*["']https?:\/\//i;
const ZIP_SIG = [0x50, 0x4b, 0x03, 0x04];

export function validarTemplate(nome: string, bytes: Uint8Array): {
  tipo: "docx" | "html"; erro?: string; tagsOk?: string[]; tagsDesconhecidas?: string[]; avisos?: string[];
} {
  const n = nome.toLowerCase();
  const ext = n.endsWith(".docx") ? "docx" : n.endsWith(".html") || n.endsWith(".htm") ? "html" : null;
  if (!ext) return { tipo: "html", erro: "Envie um arquivo .docx ou .html." };

  if (ext === "docx") {
    const ok = bytes.length >= 4 && ZIP_SIG.every((b, i) => bytes[i] === b);
    if (!ok) return { tipo: "docx", erro: "Arquivo .docx inválido." };
    return { tipo: "docx" };
  }

  const texto = new TextDecoder().decode(bytes);
  const tags = tagsNoTexto(texto);
  const tagsOk = tags.filter((t) => CONHECIDAS.has(t));
  const tagsDesconhecidas = tags.filter((t) => !CONHECIDAS.has(t));
  const avisos: string[] = [];
  if (EXTERNO.test(texto)) {
    avisos.push("O HTML referencia um recurso externo (http). Embuta imagens/estilos como data URI — recursos externos não são carregados na geração.");
  }
  return { tipo: "html", tagsOk, tagsDesconhecidas, avisos };
}
