// Roda supabase/tests/rls.test.sql numa transação e faz ROLLBACK no fim
// (não persiste dados de teste). Um `raise exception` num assert => falha.
// Uso: node --env-file=.env.local scripts/db-test-rls.mjs
import { readFileSync } from "node:fs";
import { makeClient } from "./_db.mjs";

const TEST_FILE = "supabase/tests/rls.test.sql";

const client = makeClient();
const notices = [];
client.on("notice", (msg) => notices.push(msg.message));

await client.connect();
try {
  const sql = readFileSync(TEST_FILE, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("rollback");
    const oks = notices.filter((n) => n.startsWith("OK:"));
    console.log(notices.join("\n"));
    console.log(`\n✓ TODOS OS ASSERTS PASSARAM (${oks.length} OK).`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    console.log(notices.join("\n"));
    console.error(`\n✗ FALHA NO TESTE DE RLS:\n${err.message}`);
    process.exitCode = 1;
  }
} finally {
  await client.end().catch(() => {});
}
