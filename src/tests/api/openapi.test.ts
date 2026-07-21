import { describe, it, expect } from "vitest";
import { documentoOpenApi, ENDPOINTS } from "@/lib/api/openapi";

describe("documentoOpenApi", () => {
  const doc = documentoOpenApi() as {
    openapi: string;
    paths: Record<string, Record<string, unknown>>;
    components: { securitySchemes: Record<string, unknown> };
  };
  it("é um OpenAPI 3.1 com esquema de segurança bearer", () => {
    expect(doc.openapi.startsWith("3.1")).toBe(true);
    expect(doc.components.securitySchemes).toHaveProperty("apiKey");
  });
  it("tem um path por endpoint declarado", () => {
    for (const e of ENDPOINTS) {
      expect(doc.paths[e.caminho]?.[e.metodo.toLowerCase()]).toBeTruthy();
    }
  });
  it("inclui clientes (GET+POST) e a baixa de título (POST)", () => {
    expect(doc.paths["/clientes"]).toHaveProperty("get");
    expect(doc.paths["/clientes"]).toHaveProperty("post");
    expect(doc.paths["/titulos/{id}/baixa"]).toHaveProperty("post");
  });
});
