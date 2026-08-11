import { gunzipSync } from "node:zlib";

// O XML autorizado é guardado em `nfse.nfse_xml` como gzip+base64 (ver lib/nfse/envio.ts:
// `gzipSync(xml).toString("base64")`). Para servir/baixar, é preciso descomprimir de volta ao
// XML puro. Se o conteúdo não for gzip válido (dados legados gravados crus), devolve como veio.
export function descomprimirXmlNfse(armazenado: string): string {
  try {
    return gunzipSync(Buffer.from(armazenado, "base64")).toString("utf8");
  } catch {
    return armazenado;
  }
}
