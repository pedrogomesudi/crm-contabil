// Helper de conexão com o Postgres do Supabase (TLS verificado pela CA fixada).
// Reutilizado pelos scripts de migration e de testes de RLS.
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function makeClient() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL ausente (rode com --env-file=.env.local).");
  }
  // Resolve a CA relativa à raiz do projeto (não ao CWD).
  const caPath = process.env.SUPABASE_DB_CA
    ? process.env.SUPABASE_DB_CA
    : fileURLToPath(new URL("../supabase/db-ca.crt", import.meta.url));
  if (!existsSync(caPath)) {
    throw new Error(`Certificado da CA não encontrado em "${caPath}".`);
  }
  return new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") },
    connectionTimeoutMillis: 15000,
  });
}
