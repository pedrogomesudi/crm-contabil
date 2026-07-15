// Rotaciona a chave-mestra: desembrulha cada DEK com a mestra ATUAL e re-embrulha com a
// NOVA. O dado cifrado NÃO é tocado (a DEK não muda de valor).
//
//   MASTER_CRIPTO_KEY (a atual) no ambiente e:
//   npm run cripto:rotacionar -- --nova <hex de 64>
//
// AUTO-TESTE: com a nova mestra, desembrulha e decifra um dado real de cada domínio antes
// de confirmar. Falhou → ROLLBACK.
//
// ORDEM DO ROLLOUT (importa): banco (este script) → trocar MASTER_CRIPTO_KEY no EasyPanel
// para a nova → deploy. Enquanto o env tiver a mestra antiga, o app ainda desembrulha (as
// DEKs foram re-embrulhadas com a nova, então NÃO — ver o aviso ao final).
import { makeClient } from "./_db.mjs";
import { embrulhar, desembrulhar, decifrar, DOMINIOS, AMOSTRA_SQL, mascarar } from "./_cripto.mjs";

const i = process.argv.indexOf("--nova");
const nova = i >= 0 ? process.argv[i + 1] : null;
const atual = process.env.MASTER_CRIPTO_KEY;

if (!atual || !/^[0-9a-f]{64}$/i.test(atual)) {
  console.error("ERRO: MASTER_CRIPTO_KEY (a atual) ausente ou inválida no ambiente.");
  process.exit(1);
}
if (!nova || !/^[0-9a-f]{64}$/i.test(nova)) {
  console.error("ERRO: --nova <hex de 64> obrigatória (a nova mestra).");
  console.error("Gere com: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  process.exit(1);
}
if (nova.toLowerCase() === atual.toLowerCase()) {
  console.error("ERRO: a nova mestra é igual à atual.");
  process.exit(1);
}

const db = makeClient();
await db.connect();

try {
  await db.query("begin");
  const resumo = [];

  for (const dominio of Object.keys(DOMINIOS)) {
    const row = await db.query("select dek_cifrado from chave_dados where dominio = $1", [dominio]);
    if (row.rowCount === 0) {
      resumo.push(`= ${dominio}: sem DEK (rode cripto:migrar antes) — pulado`);
      continue;
    }
    // Desembrulha com a ATUAL, re-embrulha com a NOVA. A DEK (valor) não muda.
    const dek = desembrulhar(row.rows[0].dek_cifrado, atual);
    await db.query(
      "update chave_dados set dek_cifrado = $2, versao = versao + 1, atualizado_em = now() where dominio = $1",
      [dominio, embrulhar(dek, nova)],
    );

    // Auto-teste com a NOVA mestra sobre dado real.
    const gravado = await db.query("select dek_cifrado from chave_dados where dominio = $1", [dominio]);
    const dekNova = desembrulhar(gravado.rows[0].dek_cifrado, nova);
    const amostra = await db.query(AMOSTRA_SQL[dominio]);
    if (amostra.rowCount === 0) {
      resumo.push(`+ ${dominio}: re-embrulhado (sem dado — auto-teste pulado)`);
    } else {
      try {
        decifrar(amostra.rows[0].pacote, dekNova);
        resumo.push(`✓ ${dominio}: re-embrulhado; dado real decifra com a nova mestra`);
      } catch {
        throw new Error(`AUTO-TESTE FALHOU em "${dominio}" com a nova mestra. ROLLBACK — nada mudou.`);
      }
    }
  }

  await db.query("commit");
  console.log(resumo.join("\n"));
  console.log(`\n✓ DEKs re-embrulhadas com a nova mestra (${mascarar(nova)}).`);
  console.log("\nAGORA, NA ORDEM:");
  console.log("  1. Troque MASTER_CRIPTO_KEY no EasyPanel para a NOVA (e no tenants/<slug>.env).");
  console.log("  2. Reinicie/implante o app (o cache de DEK em memória precisa recarregar com a nova mestra).");
  console.log("  ATENÇÃO: até o passo 1+2, o app com a mestra ANTIGA não desembrulha as DEKs novas — faça já.");
} catch (e) {
  await db.query("rollback");
  console.error(`ERRO: ${e.message}`);
  process.exit(1);
} finally {
  await db.end();
}
