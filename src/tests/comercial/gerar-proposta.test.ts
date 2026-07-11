import { describe, it, expect } from "vitest";
import { renderHtml, sanitizarHtml, validarTemplate } from "@/lib/comercial/gerar-proposta";

describe("renderHtml", () => {
  it("substitui tags simples", () => {
    const out = renderHtml("<p>Para: {nome_cliente}</p>", { nome_cliente: "Padaria X" }, []);
    expect(out).toContain("Para: Padaria X");
  });
  it("expande o bloco {#itens}", () => {
    const tpl = "<ul>{#itens}<li>{descricao}: {valor}</li>{/itens}</ul>";
    const out = renderHtml(tpl, {}, [
      { descricao: "A", recorrencia: "Mensal", valor: "R$ 1,00" },
      { descricao: "B", recorrencia: "Único", valor: "R$ 2,00" },
    ]);
    expect(out).toBe("<ul><li>A: R$ 1,00</li><li>B: R$ 2,00</li></ul>");
  });
  it("tag ausente vira vazio", () => {
    expect(renderHtml("<p>{inexistente}</p>", {}, [])).toBe("<p></p>");
  });
});

describe("sanitizarHtml", () => {
  it("remove <script>, on* e javascript:", () => {
    const dirty = `<div onclick="x()"><script>alert(1)</script><a href="javascript:evil()">y</a></div>`;
    const clean = sanitizarHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/onclick/i);
    expect(clean).not.toMatch(/javascript:/i);
  });
});

describe("validarTemplate", () => {
  it("rejeita docx inválido (sem assinatura ZIP)", () => {
    const r = validarTemplate("modelo.docx", new TextEncoder().encode("não é zip"));
    expect(r.erro).toBeTruthy();
  });
  it("aceita HTML e lista tags conhecidas e desconhecidas", () => {
    const html = "<p>{nome_cliente} {total_mensal} {qualquer_coisa}</p>";
    const r = validarTemplate("m.html", new TextEncoder().encode(html));
    expect(r.tipo).toBe("html");
    expect(r.erro).toBeUndefined();
    expect(r.tagsOk).toEqual(expect.arrayContaining(["nome_cliente", "total_mensal"]));
    expect(r.tagsDesconhecidas).toContain("qualquer_coisa");
  });
  it("avisa sobre recurso externo no HTML", () => {
    const html = `<img src="https://cdn.example.com/logo.png">`;
    const r = validarTemplate("m.html", new TextEncoder().encode(html));
    expect(r.avisos?.some((a) => /externo/i.test(a))).toBe(true);
  });
});
