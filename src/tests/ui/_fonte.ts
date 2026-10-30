import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Varreduras de responsividade leem o CÓDIGO-FONTE, não o HTML renderizado: o objetivo é
// impedir que uma tabela nova nasça sem rolagem, e isso nenhum teste de render alcança.
export function arquivosTsx(raiz = "src"): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(raiz)) {
    const caminho = join(raiz, nome);
    if (statSync(caminho).isDirectory()) {
      if (caminho === join("src", "tests")) continue;
      out.push(...arquivosTsx(caminho));
    } else if (nome.endsWith(".tsx")) {
      out.push(caminho);
    }
  }
  return out;
}

// Comentários mencionam classes de propósito (o FormGrid explica por que o grid-cols-2 antigo
// era errado). Acusá-los como defeito seria falso positivo que ninguém consegue silenciar.
export function lerSemComentarios(caminho: string): string {
  return readFileSync(caminho, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
