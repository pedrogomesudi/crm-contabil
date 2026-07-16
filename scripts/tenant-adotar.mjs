// Adota um escritório JÁ EXISTENTE como tenant do registro — sem criar projeto nem rodar
// migration. É o caso do escritório atual (app.seusaldo.ai), que precisa entrar nos laços:
// deixá-lo de fora faria dele o primeiro a derivar (sem migration, sem cron) enquanto os
// novos recebem tudo.
//
// USO
//   npm run tenant:adotar -- --slug gomes --nome "Gomes Contabilidade" \
//     --url https://app.seusaldo.ai --de .env.local
import { copyFileSync, chmodSync, existsSync } from "node:fs";
import {
  CHAVES_CRIPTO,
  envDoTenant,
  exigirIgnoradoPeloGit,
  lerEnv,
  lerRegistry,
  salvarRegistry,
  SLUG_RE,
} from "./_tenants.mjs";

const args = process.argv.slice(2);
const opt = (n, p = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : p;
};

const abortar = (m) => {
  console.error(`ERRO: ${m}`);
  process.exit(1);
};

const slug = opt("slug");
const nome = opt("nome");
const url = opt("url");
const de = opt("de", ".env.local");

if (!slug || !SLUG_RE.test(slug)) abortar("--slug obrigatório ([a-z0-9-], 3-30 chars).");
if (!nome) abortar("--nome obrigatório.");
if (!url || !/^https:\/\//.test(url)) abortar("--url obrigatória (https).");
if (!existsSync(de)) abortar(`"${de}" não existe.`);

const destino = envDoTenant(slug);
if (existsSync(destino)) abortar(`"${destino}" já existe — este escritório já foi adotado.`);
exigirIgnoradoPeloGit(destino);

copyFileSync(de, destino);
chmodSync(destino, 0o600);

// Avisa (sem imprimir valores) o que falta no env copiado — o doctor cobrará depois.
const env = lerEnv(slug) ?? {};
const faltando = [...CHAVES_CRIPTO, "SUPABASE_DB_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter((k) => !env[k]);

const reg = lerRegistry();
reg.escritorios = [
  ...reg.escritorios.filter((e) => e.slug !== slug),
  {
    slug,
    nome,
    appUrl: url,
    projectRef: env.SUPABASE_PROJECT_REF ?? null,
    criadoEm: new Date().toISOString().slice(0, 10),
  },
].sort((a, b) => a.slug.localeCompare(b.slug));
salvarRegistry(reg);

console.log(`✓ Escritório "${nome}" adotado como tenant "${slug}".`);
console.log(`  env: ${destino} (chmod 600, fora do git)`);
if (faltando.length > 0) {
  console.log(`  ATENÇÃO — faltam no env copiado: ${faltando.join(", ")}`);
  console.log("  (o CRON_SECRET, por exemplo, costuma viver só no EasyPanel — copie-o para o arquivo.)");
}
console.log("\nAgora rode: npm run tenant:doctor");
