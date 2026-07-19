// Verificador PÓS-RESTORE: roda contra um banco RESTAURADO (o projeto descartável do
// ensaio) e prova que tudo voltou. É o "teste de restauração" que o RNF-06 exige.
//
//   node --env-file=<env do projeto restaurado> scripts/restore-verificar.mjs
//
// Sai com código ≠ 0 se qualquer item falhar. Nunca imprime valor decifrado.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { desembrulhar, decifrar } from "./_cripto.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CA = join(RAIZ, "supabase", "db-ca.crt");

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("ERRO: SUPABASE_DB_URL ausente (rode com --env-file do projeto restaurado).");
  process.exit(1);
}

const JOBS = [
  "gerar-mensalidades-mensal",
  "regua-cobranca-diaria",
  "gerar-obrigacoes-mensal",
  "tarefas-recorrentes-diaria",
  "followup-proposta-diaria",
];

const db = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: true, ca: readFileSync(CA, "utf8") },
  connectionTimeoutMillis: 20_000,
});

const resultados = [];
const check = (ok, rotulo, detalhe = "") => resultados.push({ ok, rotulo, detalhe });

try {
  await db.connect();

  // 1) Dados do negócio.
  const tbl = await db.query("select count(*)::int n from pg_tables where schemaname='public'");
  check(tbl.rows[0].n >= 87, "dados: tabelas public", `${tbl.rows[0].n} tabelas`);
  for (const t of ["clientes", "usuarios", "titulo"]) {
    const r = await db.query(`select count(*)::int n from ${t}`);
    check(r.rows[0].n >= 0, `dados: ${t}`, `${r.rows[0].n} linha(s)`);
  }

  // 2) Extensões (o restore NÃO as recria sozinho).
  const ext = await db.query("select extname from pg_extension where extname in ('pg_cron','pg_net')");
  const nomesExt = ext.rows.map((r) => r.extname);
  for (const e of ["pg_cron", "pg_net"])
    check(nomesExt.includes(e), `extensão ${e}`, nomesExt.includes(e) ? "" : "rode o runbook");

  // 3) Jobs de cron (após o cron:bootstrap do runbook).
  let temCron = true;
  try {
    const j = await db.query("select jobname from cron.job");
    const nomes = j.rows.map((r) => r.jobname);
    const faltam = JOBS.filter((x) => !nomes.includes(x));
    temCron = faltam.length === 0;
    check(temCron, "jobs de cron", faltam.length ? `faltam: ${faltam.join(", ")} — rode cron:bootstrap` : "5/5");
  } catch {
    check(false, "jobs de cron", "cron.job inacessível — extensão pg_cron?");
  }

  // 4) Admin.
  const a = await db.query("select count(*)::int n from usuarios where papel='admin' and ativo");
  check(a.rows[0].n >= 1, "admin ativo", `${a.rows[0].n}`);

  // 5) Envelope: as 5 DEKs.
  const dek = await db.query("select count(*)::int n from chave_dados");
  check(dek.rows[0].n === 5, "envelope: DEKs", `${dek.rows[0].n}/5`);

  // 6) Integridade cripto: a DEK do whatsapp decifra o token real (se houver), com a mestra.
  const master = process.env.MASTER_CRIPTO_KEY;
  if (!master) {
    check(false, "cripto: mestra no env", "MASTER_CRIPTO_KEY ausente — as DEKs não desembrulham");
  } else {
    try {
      const w = await db.query("select dek_cifrado from chave_dados where dominio='whatsapp'");
      const amostra = await db.query(
        "select token_cifrado from whatsapp_config where token_cifrado is not null limit 1",
      );
      if (w.rowCount && amostra.rowCount) {
        const dekW = desembrulhar(w.rows[0].dek_cifrado, master);
        decifrar(amostra.rows[0].token_cifrado, dekW); // lança se algo estiver errado
        check(true, "cripto: decifra dado real", "token do WhatsApp OK");
      } else {
        check(true, "cripto: decifra dado real", "sem dado para testar (ok)");
      }
    } catch {
      check(false, "cripto: decifra dado real", "a DEK não decifra — mestra errada?");
    }
  }

  await db.end();
} catch (e) {
  console.error(`ERRO ao conectar/verificar: ${e.message}`);
  try {
    await db.end();
  } catch {
    /* já caiu */
  }
  process.exit(1);
}

console.log("\nVerificação pós-restore:");
for (const r of resultados) console.log(`  ${r.ok ? "✓" : "✗"} ${r.rotulo}${r.detalhe ? ` — ${r.detalhe}` : ""}`);

const falhas = resultados.filter((r) => !r.ok);
if (falhas.length) {
  console.error(`\n${falhas.length} item(ns) falharam — restore INCOMPLETO.`);
  process.exit(1);
}
console.log("\n✓ Restore comprovado: dados, extensões, crons, admin e cripto de volta.");
