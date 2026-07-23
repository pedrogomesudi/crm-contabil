import { describe, it, expect } from "vitest";
import { ehHostMeta } from "@/lib/whatsapp/midia-storage";

// A guarda é o que impede vazar o token oficial (Bearer) para um host de terceiro —
// mesmo espírito do Client-Token restrito ao Z-API.
describe("ehHostMeta", () => {
  it("aceita os hosts oficiais da Meta", () => {
    expect(ehHostMeta("graph.facebook.com")).toBe(true);
    expect(ehHostMeta("lookaside.fbsbx.com")).toBe(true);
    expect(ehHostMeta("scontent.xx.fbcdn.net")).toBe(true);
    expect(ehHostMeta("GRAPH.FACEBOOK.COM")).toBe(true);
  });

  it("recusa host de terceiro (não vaza o Bearer)", () => {
    expect(ehHostMeta("evil.com")).toBe(false);
    expect(ehHostMeta("graph.facebook.com.evil.com")).toBe(false);
    expect(ehHostMeta("fbsbx.com.attacker.io")).toBe(false);
    expect(ehHostMeta("notfbcdn.net")).toBe(false);
  });
});
