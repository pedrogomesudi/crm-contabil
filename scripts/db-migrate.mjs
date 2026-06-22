// Aplica as migrations de supabase/migrations/*.sql em ordem, de forma idempotente.
// Rastreia o que já foi aplicado numa tabela app_migrations.
// Uso: node --env-file=.env.local scripts/db-migrate.mjs
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { makeClient } from "./_db.mjs";

const MIGRATIONS_DIR = "supabase/migrations";

const client = makeClient();
await client.connect();

try {
  await client.query(`
    create table if not exists app_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows } = await client.query("select name from app_migrations");
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= já aplicada: ${file}`);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    console.log(`+ aplicando:   ${file}`);
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into app_migrations (name) values ($1)", [file]);
      await client.query("commit");
      count++;
    } catch (err) {
      await client.query("rollback");
      console.error(`\nFALHA em ${file}:\n${err.message}`);
      process.exitCode = 1;
      break;
    }
  }
  if (!process.exitCode) {
    console.log(`\nOK — ${count} migration(s) nova(s) aplicada(s).`);
  }
} finally {
  await client.end().catch(() => {});
}
