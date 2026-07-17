import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { controleCls } from "@/components/ui/Campo";

describe("controleCls", () => {
  it("os dois degraus diferem SÓ no padding", () => {
    const padrao = controleCls()
      .split(" ")
      .filter((c) => !c.startsWith("px-") && !c.startsWith("py-"));
    const compacto = controleCls("compacto")
      .split(" ")
      .filter((c) => !c.startsWith("px-") && !c.startsWith("py-"));
    expect(padrao.sort()).toEqual(compacto.sort());
  });

  it("padrão é px-3 py-2; compacto é px-2 py-1.5", () => {
    expect(controleCls()).toContain("px-3");
    expect(controleCls()).toContain("py-2");
    expect(controleCls("compacto")).toContain("px-2");
    expect(controleCls("compacto")).toContain("py-1.5");
  });

  it("sem argumento é o padrão", () => {
    expect(controleCls()).toBe(controleCls("padrao"));
  });

  // A razão de existir da fatia 4: o token respondia "como se parece" E "quanto ocupa".
  // A largura é do contexto (FormGrid, ou w-full declarado), não do controle.
  it("NENHUM degrau carrega largura", () => {
    for (const cls of [controleCls(), controleCls("compacto")]) {
      expect(cls).not.toContain("w-full");
      expect(cls.split(" ").filter((c) => /^w-/.test(c))).toEqual([]);
    }
  });

  it("os dois trazem a aparência inteira do controle", () => {
    for (const cls of [controleCls(), controleCls("compacto")]) {
      // bg-white não é enfeite: o preflight do Tailwind força background-color:transparent
      // em input/select/textarea, então sem ele o controle mostra o creme da página.
      for (const c of [
        "rounded-lg",
        "border",
        "border-linha",
        "bg-white",
        "text-sm",
        "text-texto",
        "focus:border-verde",
      ]) {
        expect(cls).toContain(c);
      }
    }
  });
});

describe("Input/Select/Textarea", () => {
  it("os três usam o degrau padrão", () => {
    expect(renderToStaticMarkup(<Input name="a" />)).toContain(controleCls());
    expect(renderToStaticMarkup(<Select name="b" />)).toContain(controleCls());
    expect(renderToStaticMarkup(<Textarea name="c" />)).toContain(controleCls());
  });

  it("className extra continua sendo somada, não substituindo", () => {
    expect(renderToStaticMarkup(<Input name="a" className="tabular-nums" />)).toContain("tabular-nums");
  });
});
