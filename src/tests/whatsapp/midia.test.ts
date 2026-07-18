import { describe, it, expect } from "vitest";
import { iconeDeMime } from "@/lib/whatsapp/midia";

describe("iconeDeMime", () => {
  it("PDF", () => expect(iconeDeMime("application/pdf")).toBe("PDF"));
  it("Word", () => {
    expect(iconeDeMime("application/msword")).toBe("DOC");
    expect(iconeDeMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("DOC");
  });
  it("Excel", () => {
    expect(iconeDeMime("application/vnd.ms-excel")).toBe("XLS");
    expect(iconeDeMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe("XLS");
  });
  it("imagem e áudio", () => {
    expect(iconeDeMime("image/jpeg")).toBe("IMG");
    expect(iconeDeMime("audio/ogg")).toBe("AUDIO");
  });
  it("desconhecido e null viram ARQ", () => {
    expect(iconeDeMime("application/zip")).toBe("ARQ");
    expect(iconeDeMime(null)).toBe("ARQ");
  });
});
