// Diagnóstico de DERIVA entre os escritórios.
//
//   npm run tenant:doctor
//
// A partir do segundo escritório, a falha típica não é um erro — é o silêncio: um banco
// duas migrations atrás, um tenant sem os jobs de cron, um admin que ninguém criou. Nada
// disso avisa sozinho; o prejuízo aparece semanas depois, num prazo perdido.
//
// Sai com código 1 se qualquer checagem falhar (serve como check de rotina).
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { readFileSync } from "node:fs";
import { CHAVES_CRIPTO, SEGREDOS_ROTACIONAVEIS, envDoTenant, lerEnv, lerRegistry } from "./_tenants.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CA = join(RAIZ, "supabase", "db-ca.crt");

const JOBS_ESPERADOS = [
  "gerar-mensalidades-mensal",
  "regua-cobranca-diaria",
  "gerar-obrigacoes-mensal",
  "tarefas-recorrentes-diaria",
];

const migrationsNoRepo = readdirSync(join(RAIZ, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));

const { escritorios } = lerRegistry();
if (escritorios.length === 0) {
  console.error("Nenhum escritório no registry (tenants/registry.json).");
  process.exit(1);
}

async function diagnosticar(e) {
  const linha = { slug: e.slug, problemas: [], avisos: [], migracoes: "—", jobs: "—", admins: "—", chaves: "—", envelope: "—", app: "—" };

  const caminho = envDoTenant(e.slug);
  if (!existsSync(caminho)) {
    linha.problemas.push("sem .env nesta máquina");
    return linha;
  }
  const env = lerEnv(e.slug) ?? {};

  // Envelope: a mestra no env é parte das CHAVES_CRIPTO (checado acima). As 5 DEKs no banco:
  // Chaves: só a EXISTÊNCIA. Nunca imprimir valor.
  // As de cripto são IRRECUPERÁVEIS (o backup do banco guarda só o texto cifrado) → falha.
  const faltando = CHAVES_CRIPTO.filter((k) => !env[k]);
  linha.chaves = `${CHAVES_CRIPTO.length - faltando.length}/${CHAVES_CRIPTO.length}`;
  if (faltando.length > 0) {
    linha.problemas.push(`chaves de cripto ausentes (IRRECUPERÁVEIS se perdidas): ${faltando.join(", ")}`);
  }
  // As rotacionáveis dão trabalho, mas não destroem dado → apenas aviso.
  const semRot = SEGREDOS_ROTACIONAVEIS.filter((k) => !env[k]);
  if (semRot.length > 0) linha.avisos.push(`segredos rotacionáveis ausentes: ${semRot.join(", ")}`);

  // Banco: migrations, crons e admin.
  if (!env.SUPABASE_DB_URL) {
    linha.problemas.push("sem SUPABASE_DB_URL");
  } else {
    const db = new pg.Client({
      connectionString: env.SUPABASE_DB_URL,
      ssl: { rejectUnauthorized: true, ca: readFileSync(CA, "utf8") },
      connectionTimeoutMillis: 15000,
    });
    try {
      await db.connect();

      const m = await db.query("select count(*)::int n from app_migrations");
      const aplicadas = m.rows[0].n;
      linha.migracoes = `${aplicadas}/${migrationsNoRepo.length}`;
      if (aplicadas < migrationsNoRepo.length) {
        linha.problemas.push(`${migrationsNoRepo.length - aplicadas} migration(s) pendente(s) — rode db:migrate:all ANTES do deploy`);
      }

      const j = await db.query("select jobname from cron.job");
      const nomes = j.rows.map((r) => r.jobname);
      const semJob = JOBS_ESPERADOS.filter((x) => !nomes.includes(x));
      linha.jobs = `${JOBS_ESPERADOS.length - semJob.length}/${JOBS_ESPERADOS.length}`;
      if (semJob.length > 0) linha.problemas.push(`sem cron: ${semJob.join(", ")} — rode cron:bootstrap:all`);

      const a = await db.query("select count(*)::int n from usuarios where papel = 'admin' and ativo");
      linha.admins = String(a.rows[0].n);
      if (a.rows[0].n === 0) linha.problemas.push("nenhum admin ativo — ninguém consegue administrar este escritório");

      // Envelope encryption: as 5 DEKs de domínio existem em chave_dados?
      try {
        const dek = await db.query("select count(*)::int n from chave_dados");
        linha.envelope = `${dek.rows[0].n}/5`;
        if (dek.rows[0].n < 5) linha.problemas.push(`envelope incompleto (${dek.rows[0].n}/5 DEKs) — rode cripto:migrar`);
      } catch {
        linha.envelope = "sem tabela";
        linha.problemas.push("chave_dados ausente — migration 0097 não aplicada?");
      }

      await db.end();
    } catch (err) {
      linha.problemas.push(`banco inacessível: ${String(err.message).slice(0, 80)}`);
      try { await db.end(); } catch { /* já caiu */ }
    }
  }

  // App no ar?
  try {
    const r = await fetch(`${e.appUrl}/login`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    linha.app = String(r.status);
    if (r.status >= 500) linha.problemas.push(`app respondeu ${r.status}`);
  } catch {
    linha.app = "sem resposta";
    linha.problemas.push("app não respondeu");
  }

  return linha;
}

const linhas = [];
for (const e of escritorios) linhas.push(await diagnosticar(e));

console.log("\nescritório           migrations  crons  admins  chaves  envelope  app");
console.log("─".repeat(70));
for (const l of linhas) {
  const ok = l.problemas.length === 0;
  console.log(
    `${ok ? "✓" : "✗"} ${l.slug.padEnd(18)} ${String(l.migracoes).padEnd(11)} ${String(l.jobs).padEnd(6)} ` +
      `${String(l.admins).padEnd(7)} ${String(l.chaves).padEnd(7)} ${String(l.envelope).padEnd(9)} ${l.app}`,
  );
}

const comAviso = linhas.filter((l) => l.avisos.length > 0);
if (comAviso.length > 0) {
  console.log("\nAvisos (não bloqueiam — segredos que se pode gerar de novo):");
  for (const l of comAviso) for (const a of l.avisos) console.log(`  ! ${l.slug}: ${a}`);
}

const comProblema = linhas.filter((l) => l.problemas.length > 0);
if (comProblema.length > 0) {
  console.log("\nProblemas:");
  for (const l of comProblema) for (const p of l.problemas) console.log(`  ✗ ${l.slug}: ${p}`);
  console.error(`\n${comProblema.length} escritório(s) com problema.`);
  process.exit(1);
}
console.log(`\nOK — ${linhas.length} escritório(s) saudável(is).`);
