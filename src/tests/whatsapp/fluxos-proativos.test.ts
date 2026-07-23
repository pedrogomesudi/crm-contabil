import { describe, it, expect } from "vitest";
import { POLITICA, PARAMS_FLUXO, decidirEnvio, type FluxoProativo } from "@/lib/whatsapp/politica-proativo";

// Os quatro fluxos de texto convertidos na Fatia 3B (a régua veio na 3A; a NFS-e fica para a 3C).
const FLUXOS_3B: FluxoProativo[] = ["cobranca_manual", "legalizacao", "followup", "comunicado"];
const DE_JANELA: FluxoProativo[] = ["cobranca_manual", "legalizacao", "followup"];

describe("fluxos proativos 3B — não-regressão da Z-API", () => {
  it("decide texto livre em todos os quatro fluxos, com ou sem janela e com ou sem template", () => {
    for (const fluxo of FLUXOS_3B) {
      for (const naJanela of [true, false]) {
        for (const temTemplate of [true, false]) {
          const d = decidirEnvio({
            politica: POLITICA[fluxo],
            exigeTemplate: false,
            dentroDaJanela: naJanela,
            temTemplate,
          });
          expect(d.modo, `${fluxo} janela=${naJanela} template=${temTemplate}`).toBe("texto");
        }
      }
    }
  });
});

describe("fluxos proativos 3B — provedor oficial", () => {
  it("comunicado exige template mesmo com o cliente tendo falado agora", () => {
    const comTemplate = decidirEnvio({
      politica: POLITICA.comunicado,
      exigeTemplate: true,
      dentroDaJanela: true,
      temTemplate: true,
    });
    expect(comTemplate.modo).toBe("template");

    const semTemplate = decidirEnvio({
      politica: POLITICA.comunicado,
      exigeTemplate: true,
      dentroDaJanela: true,
      temTemplate: false,
    });
    expect(semTemplate.modo).toBe("falha");
  });

  it("cobrança manual, legalização e follow-up usam texto livre dentro da janela", () => {
    for (const fluxo of DE_JANELA) {
      const d = decidirEnvio({
        politica: POLITICA[fluxo],
        exigeTemplate: true,
        dentroDaJanela: true,
        temTemplate: false,
      });
      expect(d.modo, fluxo).toBe("texto");
    }
  });

  it("fora da janela, os três caem no template — e falham sem template configurado", () => {
    for (const fluxo of DE_JANELA) {
      expect(
        decidirEnvio({
          politica: POLITICA[fluxo],
          exigeTemplate: true,
          dentroDaJanela: false,
          temTemplate: true,
        }).modo,
        fluxo,
      ).toBe("template");

      const semTemplate = decidirEnvio({
        politica: POLITICA[fluxo],
        exigeTemplate: true,
        dentroDaJanela: false,
        temTemplate: false,
      });
      expect(semTemplate.modo, fluxo).toBe("falha");
      if (semTemplate.modo === "falha") expect(semTemplate.motivo).toMatch(/template/i);
    }
  });
});

describe("contrato de parâmetros dos fluxos 3B", () => {
  // A ordem é o contrato entre o template escrito na Meta e o array `params` montado no
  // call-site. Reordenar de um lado só troca o valor de {{1}} por {{2}} sem erro visível —
  // por isso a ordem fica fixada aqui.
  it("mantém nomes e ordem das posições", () => {
    expect(PARAMS_FLUXO.cobranca_manual).toEqual(["cliente", "valor", "vencimento"]);
    expect(PARAMS_FLUXO.legalizacao).toEqual(["cliente", "etapa", "processo", "data"]);
    expect(PARAMS_FLUXO.followup).toEqual(["cliente", "proposta"]);
    expect(PARAMS_FLUXO.comunicado).toEqual(["cliente", "titulo"]);
  });

  it("todo fluxo tem política e contrato de parâmetros declarados", () => {
    for (const fluxo of FLUXOS_3B) {
      expect(POLITICA[fluxo]).toBeDefined();
      expect(PARAMS_FLUXO[fluxo].length).toBeGreaterThan(0);
    }
  });
});
