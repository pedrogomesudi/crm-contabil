// Migra os 5 segredos de domínio para o envelope: cada chave atual do env vira uma DEK,
// embrulhada pela MASTER_CRIPTO_KEY e gravada em `chave_dados`.
//
//   MASTER_CRIPTO_KEY já no ambiente (+ as 5 chaves de domínio) e:
//   npm run cripto:migrar            (não sobrescreve DEK existente)
//   npm run cripto:migrar -- --forcar (re-embrulha as existentes)
//
// AUTO-TESTE: antes de confirmar, para cada domínio com dado cifrado em produção,
// desembrulha a DEK e DECIFRA um valor real. Se qualquer um falhar → ROLLBACK. Nunca
// grava uma DEK que não decifra.
import { makeClient } from "./_db.mjs";
import { embrulhar, desembrulhar, decifrar, DOMINIOS, AMOSTRA_SQL } from "./_cripto.mjs";

const forcar = process.argv.includes("--forcar");

const master = process.env.MASTER_CRIPTO_KEY;
if (!master || !/^[0-9a-f]{64}$/i.test(master)) {
  console.error("ERRO: MASTER_CRIPTO_KEY ausente ou inválida (64 hex).");
  process.exit(1);
}

const faltando = Object.values(DOMINIOS).filter((k) => !process.env[k]);
if (faltando.length) {
  console.error(`ERRO: chaves de domínio ausentes no ambiente: ${faltando.join(", ")}`);
  console.error("(a migração precisa das chaves atuais para transformá-las em DEKs)");
  process.exit(1);
}

const db = makeClient();
await db.connect();

try {
  await db.query("begin");
  const resumo = [];

  for (const [dominio, envKey] of Object.entries(DOMINIOS)) {
    const dek = process.env[envKey].toLowerCase();

    const existe = await db.query("select 1 from chave_dados where dominio = $1", [dominio]);
    if (existe.rowCount && !forcar) {
      resumo.push(`= ${dominio}: já migrado (use --forcar para re-embrulhar)`);
    } else {
      await db.query(
        `insert into chave_dados (dominio, dek_cifrado) values ($1, $2)
         on conflict (dominio) do update set dek_cifrado = excluded.dek_cifrado, versao = chave_dados.versao + 1, atualizado_em = now()`,
        [dominio, embrulhar(dek, master)],
      );
      resumo.push(`+ ${dominio}: DEK embrulhada e gravada`);
    }

    // Auto-teste: a DEK re-lida do banco decifra um dado REAL?
    const gravado = await db.query("select dek_cifrado from chave_dados where dominio = $1", [dominio]);
    const dekRecuperada = desembrulhar(gravado.rows[0].dek_cifrado, master);
    const amostra = await db.query(AMOSTRA_SQL[dominio]);
    if (amostra.rowCount === 0) {
      resumo.push(`  (${dominio}: sem dado cifrado ainda — auto-teste pulado)`);
    } else {
      try {
        decifrar(amostra.rows[0].pacote, dekRecuperada); // lança se a DEK estiver errada
        resumo.push(`  ✓ ${dominio}: dado real decifra com a DEK`);
      } catch {
        throw new Error(`AUTO-TESTE FALHOU em "${dominio}": a DEK não decifra o dado existente. Nada foi gravado.`);
      }
    }
  }

  await db.query("commit");
  console.log(resumo.join("\n"));
  console.log("\n✓ Envelope migrado. O app já usa as DEKs do banco (as chaves de env viram só fallback).");
} catch (e) {
  await db.query("rollback");
  console.error(`ERRO: ${e.message}`);
  process.exit(1);
} finally {
  await db.end();
}
