import { gzipSync } from "node:zlib";
import { request as httpsRequest } from "node:https";
import { required } from "@/lib/env";
import type { ResultadoEmissao } from "./tipos";

export function montarCorpoDps(xmlAssinado: string): string {
  return gzipSync(Buffer.from(xmlAssinado, "utf8")).toString("base64");
}

export function parseResposta(status: number, corpo: Record<string, unknown>): ResultadoEmissao {
  if (status >= 200 && status < 300 && corpo.chaveAcesso) {
    return {
      autorizada: true,
      chaveAcesso: String(corpo.chaveAcesso),
      numero: corpo.numero ? String(corpo.numero) : undefined,
      xmlNfse: typeof corpo.nfseXmlGZipB64 === "string" ? corpo.nfseXmlGZipB64 : undefined,
    };
  }
  // A Sefin pode devolver erros em formatos diferentes; tentamos os conhecidos e,
  // por fim, incluímos o corpo cru para diagnóstico.
  type Erro = { codigo?: string; Codigo?: string; code?: string; descricao?: string; Descricao?: string; mensagem?: string; message?: string };
  const lista =
    (Array.isArray(corpo.erros) && (corpo.erros as Erro[])) ||
    (Array.isArray(corpo.mensagens) && (corpo.mensagens as Erro[])) ||
    (Array.isArray(corpo.Errors) && (corpo.Errors as Erro[])) ||
    [];
  const mensagens = lista
    .map((e) =>
      `${e.codigo ?? e.Codigo ?? e.code ?? ""} ${e.descricao ?? e.Descricao ?? e.mensagem ?? e.message ?? ""}`.trim(),
    )
    .filter(Boolean);
  if (!mensagens.length) {
    const raw = typeof corpo.message === "string" ? corpo.message : JSON.stringify(corpo);
    mensagens.push(`HTTP ${status}: ${raw.slice(0, 800)}`);
  }
  return { autorizada: false, mensagens };
}

function baseUrl(ambiente: "homologacao" | "producao"): string {
  return ambiente === "producao"
    ? required(process.env.NFSE_URL_PRODUCAO, "NFSE_URL_PRODUCAO")
    : required(process.env.NFSE_URL_HOMOLOGACAO, "NFSE_URL_HOMOLOGACAO");
}

// POST /nfse com mTLS (certificado de cliente = A1). node:https expõe pfx no request.
export async function enviarDps(
  xmlAssinado: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<ResultadoEmissao> {
  const url = new URL(`${baseUrl(ambiente)}/nfse`);
  const body = JSON.stringify({ dpsXmlGZipB64: montarCorpoDps(xmlAssinado) });
  const corpo = await new Promise<{ status: number; json: Record<string, unknown> }>((resolve, reject) => {
    const req = httpsRequest(
      {
        method: "POST",
        hostname: url.hostname,
        path: url.pathname,
        port: url.port || 443,
        pfx: cert.pfx,
        passphrase: cert.senha,
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          let json: Record<string, unknown> = {};
          try {
            json = txt ? (JSON.parse(txt) as Record<string, unknown>) : {};
          } catch {
            json = { erros: [{ descricao: txt.slice(0, 200) }] };
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
  return parseResposta(corpo.status, corpo.json);
}
