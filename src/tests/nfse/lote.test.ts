import { describe, it, expect } from "vitest";
import { classificarSituacao } from "@/lib/nfse/lote";

describe("classificarSituacao", () => {
  it("sem documento => sem_documento (mesmo que já emitida)", () => {
    expect(classificarSituacao("", false)).toBe("sem_documento");
    expect(classificarSituacao("", true)).toBe("sem_documento");
  });
  it("com documento e já emitida => ja_emitida", () => {
    expect(classificarSituacao("12345678000199", true)).toBe("ja_emitida");
  });
  it("com documento e não emitida => apta", () => {
    expect(classificarSituacao("12345678000199", false)).toBe("apta");
  });
});
