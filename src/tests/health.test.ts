import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";
import { version } from "@/../package.json";

describe("GET /api/health", () => {
  it("retorna status ok e a versão no ar", async () => {
    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ status: "ok", versao: version });
  });
});
