import { request as httpsRequest } from "node:https";

// Baixa o DANFSe (PDF) do Ambiente de Dados Nacional (ADN) por chave de acesso,
// autenticando com o certificado A1 (mTLS). Retorna null em qualquer falha.
export async function baixarDanfsePdf(
  chave: string,
  cert: { pfx: Buffer; senha: string },
  ambiente: "homologacao" | "producao",
): Promise<Buffer | null> {
  const host = ambiente === "producao" ? "adn.nfse.gov.br" : "adn.producaorestrita.nfse.gov.br";
  return new Promise((resolve) => {
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
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}
