import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { inputCls } from "@/components/ui/Campo";

describe("controles de formulário", () => {
  it("os três usam a MESMA classe base (era copiada em 4 arquivos)", () => {
    const base = inputCls.split(" ")[0];
    expect(renderToStaticMarkup(<Input name="a" />)).toContain(base);
    expect(renderToStaticMarkup(<Select name="b" />)).toContain(base);
    expect(renderToStaticMarkup(<Textarea name="c" />)).toContain(base);
  });

  it("className extra continua sendo somada, não substituindo", () => {
    expect(renderToStaticMarkup(<Input name="a" className="tabular-nums" />)).toContain("tabular-nums");
  });
});
