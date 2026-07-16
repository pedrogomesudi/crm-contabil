// Achata um HTML "empacotado" (bundle React) num HTML estático com tags {…}.
// Extrai o template pré-renderizado e o manifesto de assets, embute cada asset
// como data URI, remove os <script> (sem hidratação/JS) e troca os placeholders
// 〔 … 〕 pelas tags da proposta. Uso:
//   node scripts/achatar-proposta.mjs <entrada.html> <saida.html>
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const [, , entrada, saida] = process.argv;
if (!entrada || !saida) {
  console.error("Uso: node scripts/achatar-proposta.mjs <entrada.html> <saida.html>");
  process.exit(1);
}

const html = readFileSync(entrada, "utf8");

function extrairScript(tipo) {
  const m = html.match(new RegExp(`<script type="${tipo}">([\\s\\S]*?)<\\/script>`));
  return m ? m[1] : null;
}

const templateRaw = extrairScript("__bundler/template");
const manifestRaw = extrairScript("__bundler/manifest");
if (!templateRaw) {
  console.error('Não encontrei <script type="__bundler/template"> — o arquivo não é um bundle reconhecido.');
  process.exit(1);
}

let template = JSON.parse(templateRaw);
const manifest = manifestRaw ? JSON.parse(manifestRaw) : {};

// Resolve cada UUID de asset para um data: URI.
for (const [uuid, entry] of Object.entries(manifest)) {
  let bytes = Buffer.from(entry.data, "base64");
  if (entry.compressed) bytes = gunzipSync(bytes);
  const dataUri = `data:${entry.mime};base64,${bytes.toString("base64")}`;
  template = template.split(uuid).join(dataUri);
}

// Remove todos os <script> (o documento passa a ser estático) e SRI/crossorigin.
template = template
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
  .replace(/\s+integrity="[^"]*"/gi, "")
  .replace(/\s+crossorigin="[^"]*"/gi, "");

// Placeholders 〔 … 〕 -> tags da proposta.
const TAGS = [
  [/〔\s*Nome do Cliente\s*〕/g, "{nome_cliente}"],
  [/〔\s*Mês\/Ano\s*〕/g, "{mes_ano}"],
  [/〔\s*Nome do respons[aá]vel\s*〕/g, "{responsavel_nome}"],
  [/〔\s*e-?mail\s*〕/gi, "{responsavel_email}"],
  [/〔\s*telefone\s*〕/gi, "{responsavel_telefone}"],
];
for (const [re, tag] of TAGS) template = template.replace(re, tag);

// Aviso: placeholders 〔 〕 remanescentes não mapeados.
const restantes = [...template.matchAll(/〔[^〕]*〕/g)].map((m) => m[0]);
if (restantes.length) console.warn("Placeholders não mapeados (troque manualmente por tags):", [...new Set(restantes)]);

writeFileSync(saida, template);
console.log(`OK — HTML estático gravado em ${saida} (${template.length} chars).`);
