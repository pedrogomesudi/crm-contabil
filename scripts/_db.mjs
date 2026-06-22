// Helper de conexão com o Postgres do Supabase (TLS verificado pela CA fixada).
// Reutilizado pelos scripts de migration e de testes de RLS.
import pg from "pg";
import { readFileSync, existsSync } from "node:fs";

export function makeClient() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL ausente (rode com --env-file=.env.local).");
  }
  const caPath = process.env.SUPABASE_DB_CA ?? "supabase/db-ca.crt";
  if (!existsSync(caPath)) {
    throw new Error(`Certificado da CA não encontrado em "${caPath}".`);
  }
  return new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: true, ca: readFileSync(caPath, "utf8") },
    connectionTimeoutMillis: 15000,
  });
}
