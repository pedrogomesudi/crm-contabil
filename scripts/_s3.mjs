// Cliente S3 mínimo (PutObject / ListObjectsV2 / DeleteObject) com assinatura AWS SigV4
// própria — sem SDK, sem CLI. Funciona com AWS S3 e com endpoints S3-compatíveis
// (Backblaze B2, Wasabi, MinIO). O dump comprimido cabe num único PutObject.
//
// Env: BACKUP_S3_ENDPOINT (ex.: s3.us-west-002.backblazeb2.com), BACKUP_S3_REGION,
//      BACKUP_S3_BUCKET, BACKUP_S3_KEY_ID, BACKUP_S3_SECRET.
import { createHash, createHmac } from "node:crypto";

const cfg = () => ({
  endpoint: process.env.BACKUP_S3_ENDPOINT,
  region: process.env.BACKUP_S3_REGION || "us-east-1",
  bucket: process.env.BACKUP_S3_BUCKET,
  keyId: process.env.BACKUP_S3_KEY_ID,
  secret: process.env.BACKUP_S3_SECRET,
});

export function s3Configurado() {
  const c = cfg();
  return Boolean(c.endpoint && c.bucket && c.keyId && c.secret);
}

const sha256hex = (b) => createHash("sha256").update(b).digest("hex");
const hmac = (key, data) => createHmac("sha256", key).update(data).digest();

// path-style: https://<endpoint>/<bucket>/<chave> — o mais compatível entre provedores.
function assinar(metodo, chave, corpo, query = "") {
  const c = cfg();
  const host = c.endpoint;
  const agora = new Date();
  const amz = agora.toISOString().replace(/[:-]|\.\d{3}/g, ""); // AAAAMMDDTHHMMSSZ
  const data = amz.slice(0, 8);
  const canonicalUri = `/${c.bucket}/${chave}`.replace(/[^/]+/g, (s) => encodeURIComponent(s));
  const payloadHash = sha256hex(corpo ?? Buffer.alloc(0));

  const headers = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amz,
  };
  const assinados = Object.keys(headers).sort();
  const canonicalHeaders = assinados.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaders = assinados.join(";");

  const canonicalRequest = [metodo, canonicalUri, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const escopo = `${data}/${c.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amz, escopo, sha256hex(canonicalRequest)].join("\n");

  let k = hmac(`AWS4${c.secret}`, data);
  k = hmac(k, c.region);
  k = hmac(k, "s3");
  k = hmac(k, "aws4_request");
  const assinatura = createHmac("sha256", k).update(stringToSign).digest("hex");

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${c.keyId}/${escopo}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${assinatura}`;

  return {
    url: `https://${host}${canonicalUri}${query ? `?${query}` : ""}`,
    headers: { ...headers, authorization },
  };
}

export async function putObject(chave, corpo, contentType = "application/octet-stream") {
  try {
    const { url, headers } = assinar("PUT", chave, corpo);
    const r = await fetch(url, { method: "PUT", headers: { ...headers, "content-type": contentType }, body: corpo });
    if (!r.ok) return { erro: `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { erro: e.message };
  }
}

export async function deleteObject(chave) {
  try {
    const { url, headers } = assinar("DELETE", chave, null);
    const r = await fetch(url, { method: "DELETE", headers });
    if (!r.ok && r.status !== 404) return { erro: `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { erro: e.message };
  }
}

export async function listObjects(prefixo) {
  try {
    const c = cfg();
    const query = `list-type=2&prefix=${encodeURIComponent(prefixo)}`;
    // Assina com a URL do bucket (chave vazia) e a query.
    const { url, headers } = assinar("GET", "", null, query);
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    const xml = await r.text();
    const chaves = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
    void c;
    return { chaves };
  } catch (e) {
    return { erro: e.message };
  }
}
