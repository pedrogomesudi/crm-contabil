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
  it("expõe components.schemas dos recursos", () => {
    const d = documentoOpenApi() as { components: { schemas: Record<string, unknown> } };
    expect(d.components.schemas).toHaveProperty("Cliente");
    expect(d.components.schemas).toHaveProperty("Titulo");
  });
  it("a lista de clientes referencia o schema Cliente no 200", () => {
    const d = documentoOpenApi() as {
      paths: Record<
        string,
        Record<string, { responses: Record<string, { content?: Record<string, { schema?: unknown }> }> }>
      >;
    };
    const schema = d.paths["/clientes"]?.get?.responses?.["200"]?.content?.["application/json"]?.schema as
      | { properties?: { dados?: { items?: { $ref?: string } } } }
      | undefined;
    expect(schema?.properties?.dados?.items?.$ref).toBe("#/components/schemas/Cliente");
  });
});
