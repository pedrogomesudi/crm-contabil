import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

describe("manifest do PWA", () => {
  it("escopa o portal e é standalone", () => {
    const m = manifest();
    expect(m.scope).toBe("/portal");
    expect(m.start_url).toBe("/portal");
    expect(m.display).toBe("standalone");
    expect(m.icons?.some((i) => i.sizes === "512x512")).toBe(true);
  });
});
