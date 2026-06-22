// Teste de conectividade com o Postgres do Supabase (via pooler).
// Uso: node --env-file=.env.local scripts/db-test.mjs
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error("SUPABASE_DB_URL ausente no ambiente (.env.local).");
  process.exit(1);
}

// CA do Supabase (baixada do painel) — verificação TLS real, sem desabilitar.
const caPath = process.env.SUPABASE_DB_CA ?? "supabase/db-ca.crt";
if (!existsSync(caPath)) {
  console.error(
    `Certificado da CA não encontrado em "${caPath}".\n` +
      "Baixe em: Supabase → Settings → Database → SSL Configuration → Download certificate\n" +
      "e salve como supabase/db-ca.crt (ou aponte SUPABASE_DB_CA para o caminho).",
  );
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") },
  connectionTimeoutMillis: 15000,
});

try {
  await client.connect();
  const { rows } = await client.query("select current_user, current_database(), version()");
  console.log("CONEXÃO OK");
  console.log("usuário:", rows[0].current_user);
  console.log("database:", rows[0].current_database);
  console.log("versão:", rows[0].version.split(" ").slice(0, 2).join(" "));
} catch (err) {
  console.error("FALHA NA CONEXÃO:", err.message);
  process.exitCode = 2;
} finally {
  await client.end().catch(() => {});
}
