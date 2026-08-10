import { request as httpsRequest } from "node:https";

export type ResultadoDanfse = { pdf: Buffer } | { erro: string };

// Baixa o DANFSe (PDF) do Ambiente de Dados Nacional (ADN) por chave de acesso,
// autenticando com o certificado A1 (mTLS). Em falha, devolve o MOTIVO (status HTTP do
// ADN, timeout ou erro de rede/TLS) para o chamador poder exibir e diagnosticar.
export async function baixarDanfsePdf(
  chave: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<ResultadoDanfse> {
  const host = ambiente === "producao" ? "adn.nfse.gov.br" : "adn.producaorestrita.nfse.gov.br";
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ResultadoDanfse) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const req = httpsRequest(
      {
        method: "GET",
        hostname: host,
        path: `/danfse/${chave}`,
        port: 443,
        pfx: cert.pfx,
        passphrase: cert.senha,
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          if (res.statusCode === 200) return done({ pdf: Buffer.concat(chunks) });
          const corpo = Buffer.concat(chunks).toString("utf8").slice(0, 160).replace(/\s+/g, " ").trim();
          done({ erro: `ADN respondeu HTTP ${res.statusCode}${corpo ? ` — ${corpo}` : ""}` });
        });
      },
    );
    // No timeout, registra o motivo ANTES de destruir (o destroy dispara 'error', mas o
    // guard `settled` mantém a mensagem de timeout).
    req.on("timeout", () => {
      done({ erro: "tempo esgotado ao falar com o ADN (30s)" });
      req.destroy();
    });
    req.on("error", (e) => done({ erro: `falha de rede/TLS com o ADN: ${e.message}` }));
    req.end();
  });
}
