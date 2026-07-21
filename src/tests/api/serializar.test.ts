import { describe, it, expect } from "vitest";
import {
  serializarCliente,
  serializarTitulo,
  serializarBoleto,
  serializarObrigacao,
  serializarDocumento,
} from "@/lib/api/serializar";

describe("serializarCliente", () => {
  it("expõe identidade/fiscal e esconde colunas internas", () => {
    const dto = serializarCliente({
      id: "c1",
      razao_social: "ACME",
      cpf_cnpj: "11222333000181",
      status: "ativo",
      flag_tem_folha: true,
      contador_id: "u1",
      dominio_snapshot: { x: 1 },
      socios: [{ cpf: "x" }],
      criado_por: "u9",
    });
    expect(dto.razao_social).toBe("ACME");
    expect(dto.flags.tem_folha).toBe(true);
    expect(dto).not.toHaveProperty("contador_id");
    expect(dto).not.toHaveProperty("dominio_snapshot");
    expect(dto).not.toHaveProperty("socios");
    expect(dto).not.toHaveProperty("criado_por");
  });
});

describe("serializarTitulo", () => {
  it("valor vira number e recebido soma baixas não estornadas", () => {
    const dto = serializarTitulo({
      id: "t1",
      cliente_id: "c1",
      tipo: "RECEBER",
      valor: "100.00",
      competencia: "2026-07-01",
      vencimento: "2026-07-10",
      status: "ABERTO",
      baixa: [
        { valor_recebido: "40.00", estornada: false },
        { valor_recebido: "10.00", estornada: true },
      ],
    });
    expect(dto.valor).toBe(100);
    expect(dto.recebido).toBe(40);
    expect(dto).not.toHaveProperty("criado_por");
  });
});

describe("serializarBoleto", () => {
  it("valor vira number e esconde provedor/pdf_path", () => {
    const dto = serializarBoleto({
      id: "b1",
      titulo_id: "t1",
      valor: "50.00",
      status: "emitido",
      provedor: "inter",
      pdf_path: "x/y.pdf",
    });
    expect(dto.valor).toBe(50);
    expect(dto).not.toHaveProperty("provedor");
    expect(dto).not.toHaveProperty("pdf_path");
  });
});

describe("serializarObrigacao", () => {
  it("deriva status entregue e traz o nome via join", () => {
    const dto = serializarObrigacao({
      id: "o1",
      cliente_id: "c1",
      competencia: "2026-06-01",
      status: "pendente",
      entregue_em: "2026-07-05",
      obrigacao: { nome: "DAS", codigo: "DAS", esfera: "federal" },
      responsavel_id: "u1",
    });
    expect(dto.status).toBe("entregue");
    expect(dto.obrigacao.nome).toBe("DAS");
    expect(dto).not.toHaveProperty("responsavel_id");
  });
  it("sem entregue_em mantém o status do enum", () => {
    const dto = serializarObrigacao({ id: "o2", status: "pendente", entregue_em: null, obrigacao: { nome: "X" } });
    expect(dto.status).toBe("pendente");
  });
});

describe("serializarDocumento", () => {
  it("esconde caminho_storage e texto_extraido", () => {
    const dto = serializarDocumento({
      id: "d1",
      cliente_id: "c1",
      nome: "guia.pdf",
      caminho_storage: "c1/x.pdf",
      texto_extraido: "conteudo",
      texto_status: "ok",
    });
    expect(dto.nome).toBe("guia.pdf");
    expect(dto).not.toHaveProperty("caminho_storage");
    expect(dto).not.toHaveProperty("texto_extraido");
  });
});
