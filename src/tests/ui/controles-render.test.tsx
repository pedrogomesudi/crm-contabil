import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { inputCls } from "@/components/ui/Campo";

describe("controles de formulário", () => {
  it("os três usam a MESMA classe base, inteira (era copiada em 4 arquivos, e uma cópia já tinha divergido)", () => {
    expect(renderToStaticMarkup(<Input name="a" />)).toContain(inputCls);
    expect(renderToStaticMarkup(<Select name="b" />)).toContain(inputCls);
    expect(renderToStaticMarkup(<Textarea name="c" />)).toContain(inputCls);
  });

  it("className extra continua sendo somada, não substituindo", () => {
    expect(renderToStaticMarkup(<Input name="a" className="tabular-nums" />)).toContain("tabular-nums");
  });
});
