import { describe, it, expect } from "vitest";
// @ts-expect-error — .mjs de ferramental (JS puro), sem tipos.
import { planoRetencao } from "../../../scripts/_retencao.mjs";

describe("planoRetencao (7 diários + 4 semanais)", () => {
  it("mantém os 7 dumps mais recentes", () => {
    const nomes = Array.from({ length: 20 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}.sql.gz`);
    const { manter } = planoRetencao(nomes, "2026-07-20");
    expect(manter).toContain("2026-07-20.sql.gz");
    expect(manter).toContain("2026-07-14.sql.gz"); // o 7º mais recente
    expect(manter).not.toContain("2026-07-13.sql.gz");
  });

  it("mantém um domingo dentro da janela como semanal e apaga o antigo fora dela", () => {
    // 20 dumps diários de julho + um domingo bem antigo (2026-05-10).
    const nomes = [
      ...Array.from({ length: 20 }, (_, i) => `2026-07-${String(i + 1).padStart(2, "0")}.sql.gz`),
      "2026-05-10.sql.gz", // domingo, mas fora dos 28 dias
    ];
    const r = planoRetencao(nomes, "2026-07-20");
    // 2026-07-05 é domingo, dentro de 28 dias e FORA dos 7 diários (07-14..07-20) → semanal mantido.
    expect(r.manter).toContain("2026-07-05.sql.gz");
    // o domingo antigo não é diário recente nem semanal na janela → apagado.
    expect(r.apagar).toContain("2026-05-10.sql.gz");
  });

  it("ignora nomes fora do padrão", () => {
    const r = planoRetencao(["2026-07-20.sql.gz", "lixo.txt", "backup.sql"], "2026-07-20");
    expect(r.manter).toEqual(["2026-07-20.sql.gz"]);
    expect(r.apagar).toEqual([]);
  });
});
