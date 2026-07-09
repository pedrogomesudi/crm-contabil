import { describe, it, expect } from "vitest";
import { paraCSV } from "@/lib/financeiro/csv";

describe("paraCSV", () => {
  it("junta com ; e CRLF", () => {
    expect(paraCSV(["A", "B"], [["1", "2"], ["3", "4"]])).toBe("A;B\r\n1;2\r\n3;4");
  });
  it("escapa ;, aspas e quebra de linha", () => {
    expect(paraCSV(["X"], [['a;b'], ['diz "oi"'], ["linha1\nlinha2"]])).toBe('X\r\n"a;b"\r\n"diz ""oi"""\r\n"linha1\nlinha2"');
  });
});
