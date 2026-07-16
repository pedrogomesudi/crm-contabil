import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { version } from "@/../package.json";

// O `version` do package.json ficou em "0.1.0" por 6 versões porque ninguém o lia. Agora o
// /api/health o expõe (é como se sabe o que está no ar), então ele precisa ser verdade — e
// "precisa" só vale se algo verificar. O CHANGELOG é a fonte editorial da release; este teste
// amarra os dois. Esquecer de subir a versão no PR de release passa a quebrar o CI.
const ultimaVersaoLancada = (): string => {
  const changelog = readFileSync(resolve(process.cwd(), "CHANGELOG.md"), "utf8");
  // A primeira `## [x.y.z]` do arquivo — pulando a `## [Não lançado]`, que não é versão.
  const m = /^## \[(\d+\.\d+\.\d+)\]/m.exec(changelog);
  return m?.[1] ?? "";
};

describe("versão do package.json", () => {
  it("bate com a última versão lançada no CHANGELOG", () => {
    expect(version).toBe(ultimaVersaoLancada());
  });

  it("é semver, sem 'v' (a tag tem o prefixo, o campo não)", () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
