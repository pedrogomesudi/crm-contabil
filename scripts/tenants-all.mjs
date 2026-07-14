// Roda um script de banco para TODOS os escritórios do registry.
//
//   node scripts/tenants-all.mjs db-migrate      (npm run db:migrate:all)
//   node scripts/tenants-all.mjs db-test-rls     (npm run db:test:all)
//   node scripts/tenants-all.mjs bootstrap-cron  (npm run cron:bootstrap:all)
//
// FALHA RUIDOSA (o ponto do script): sai com código 1 se QUALQUER escritório falhar, e
// diz quais. A partir do segundo escritório, esquecer um é a falha silenciosa clássica —
// ele fica sem a migration ou sem os crons, e ninguém percebe até um prazo estourar.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { envDoTenant, lerEnv, lerRegistry } from "./_tenants.mjs";

const PERMITIDOS = new Set(["db-migrate", "db-test-rls", "bootstrap-cron"]);
const script = process.argv[2];

if (!PERMITIDOS.has(script)) {
  console.error(`Uso: node scripts/tenants-all.mjs <${[...PERMITIDOS].join("|")}>`);
  process.exit(1);
}

const { escritorios } = lerRegistry();
if (escritorios.length === 0) {
  console.error("Nenhum escritório no registry (tenants/registry.json). Rode tenant:novo ou tenant:adotar.");
  process.exit(1);
}

const falhas = [];

for (const e of escritorios) {
  const caminho = envDoTenant(e.slug);
  console.log(`\n══ ${e.slug} (${e.nome}) ══`);

  if (!existsSync(caminho)) {
    console.error(`  ✗ ${caminho} não existe — credenciais ausentes nesta máquina.`);
    falhas.push(`${e.slug}: sem .env`);
    continue;
  }

  // O bootstrap-cron precisa do APP_URL e do CRON_SECRET do escritório.
  const env = { ...process.env };
  if (script === "bootstrap-cron") {
    const t = lerEnv(e.slug) ?? {};
    env.APP_URL = e.appUrl;
    env.CRON_SECRET = t.CRON_SECRET;
    if (!env.CRON_SECRET) {
      console.error("  ✗ CRON_SECRET ausente no .env do escritório.");
      falhas.push(`${e.slug}: sem CRON_SECRET`);
      continue;
    }
  }

  const r = spawnSync(process.execPath, [`--env-file=${caminho}`, `scripts/${script}.mjs`], {
    stdio: "inherit",
    env,
  });
  if (r.status !== 0) falhas.push(`${e.slug}: ${script} saiu com código ${r.status}`);
}

console.log("\n──────── resumo ────────");
for (const e of escritorios) {
  const falhou = falhas.find((f) => f.startsWith(`${e.slug}:`));
  console.log(`  ${falhou ? "✗" : "✓"} ${e.slug}${falhou ? ` — ${falhou.split(": ")[1]}` : ""}`);
}

if (falhas.length > 0) {
  console.error(`\n${falhas.length} escritório(s) FALHARAM. Corrija antes de seguir.`);
  process.exit(1);
}
console.log(`\nOK — ${escritorios.length} escritório(s) processado(s).`);
