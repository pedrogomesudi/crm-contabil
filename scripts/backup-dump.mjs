// Dump próprio do schema `public` (redundância dos DADOS DO NEGÓCIO — o que é nosso).
// NÃO cobre auth/storage (território do Supabase; use o backup do Supabase para restore real).
//
//   node --env-file=tenants/<slug>.env scripts/backup-dump.mjs --slug <slug>
//
// Guarda em backups/<slug>/<AAAA-MM-DD>.sql.gz, aplica retenção 7 diários + 4 semanais e,
// se BACKUP_S3_* estiver no ambiente, envia para o bucket (e replica a retenção lá).
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, readdirSync, unlinkSync, statSync, readFileSync, createWriteStream } from "node:fs";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { planoRetencao } from "./_retencao.mjs";
import { putObject, listObjects, deleteObject, s3Configurado } from "./_s3.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : null;
};
const abortar = (m) => {
  console.error(`ERRO: ${m}`);
  process.exit(1);
};

const slug = opt("slug");
if (!slug || !/^[a-z0-9-]{3,30}$/.test(slug)) abortar("--slug obrigatório ([a-z0-9-]).");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) abortar("SUPABASE_DB_URL ausente (rode com --env-file=tenants/<slug>.env).");

// pg_dump é ferramenta de cliente do Postgres — pode não estar instalada.
if (spawnSync("pg_dump", ["--version"], { stdio: "ignore" }).status !== 0) {
  abortar(
    "pg_dump não encontrado. Instale as client tools do Postgres:\n" +
      "  macOS:  brew install libpq && brew link --force libpq\n" +
      "  Ubuntu: sudo apt-get install postgresql-client",
  );
}

// Hoje no fuso de São Paulo (o nome do arquivo é a data local).
const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const dir = join(RAIZ, "backups", slug);
mkdirSync(dir, { recursive: true });
const destino = join(dir, `${hoje}.sql.gz`);

console.log(`• Dump do schema public de "${slug}"…`);

// SEM SHELL: pg_dump recebe a URL como ARGUMENTO (a senha pode ter $, !, etc. — um shell
// os expandiria). O gzip é feito em Node, ligando os streams.
// SSL com VERIFICAÇÃO do certificado (verify-full + CA fixada): o dump carrega todos os
// dados de cliente; criptografar sem verificar a identidade do servidor (o padrão do
// pg_dump) deixaria a porta aberta a man-in-the-middle.
const caPath = join(RAIZ, "supabase", "db-ca.crt");
await new Promise((resolve, reject) => {
  const dump = spawn("pg_dump", ["--schema=public", "--no-owner", "--no-privileges", dbUrl], {
    stdio: ["ignore", "pipe", "inherit"],
    env: { ...process.env, PGSSLMODE: "verify-full", PGSSLROOTCERT: caPath },
  });
  const gz = createGzip();
  const out = createWriteStream(destino);
  dump.stdout.pipe(gz).pipe(out);
  dump.on("error", reject);
  dump.on("close", (code) => (code === 0 ? out.on("close", resolve) : reject(new Error(`pg_dump saiu com ${code}`))));
}).catch((e) => abortar(e.message));

const tam = statSync(destino).size;
if (tam < 1024) abortar(`dump suspeito (${tam} bytes) — abortando antes de confiar nele.`);
console.log(`  gravado: ${destino} (${(tam / 1024).toFixed(0)} KB)`);

// Retenção local.
const locais = readdirSync(dir).filter((n) => n.endsWith(".sql.gz"));
const plano = planoRetencao(locais, hoje);
for (const nome of plano.apagar) {
  unlinkSync(join(dir, nome));
  console.log(`  retenção: apagado ${nome}`);
}
console.log(`  local: ${plano.manter.length} dump(s) mantido(s).`);

// Envio para a nuvem (opcional).
if (!s3Configurado()) {
  console.log("• Nuvem não configurada (BACKUP_S3_*) — só a cópia local. OK.");
} else {
  console.log("• Enviando para o bucket…");
  const chaveObj = `${slug}/${hoje}.sql.gz`;
  const env = await putObject(chaveObj, readFileSync(destino), "application/gzip");
  if (env.erro) abortar(`envio S3 falhou: ${env.erro}`);
  console.log(`  enviado: ${chaveObj}`);

  const objs = await listObjects(`${slug}/`);
  if (objs.erro) {
    console.log(`  (não consegui listar a nuvem para a retenção: ${objs.erro})`);
  } else {
    const nomes = objs.chaves.map((k) => k.split("/").pop());
    const planoN = planoRetencao(nomes, hoje);
    for (const nome of planoN.apagar) {
      const del = await deleteObject(`${slug}/${nome}`);
      if (!del.erro) console.log(`  retenção nuvem: apagado ${nome}`);
    }
    console.log(`  nuvem: ${planoN.manter.length} dump(s) mantido(s).`);
  }
}

console.log("\n✓ Backup concluído.");
