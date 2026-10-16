// Executa os `select` do app contra o PostgREST real e falha se algum for recusado.
//
// POR QUE EXISTE: a string do `.select()` só é interpretada em tempo de execução, pelo
// servidor. `typecheck`, `lint`, testes e `build` passam com um embed inválido. Em 30/09/2026
// um embed ambíguo (PGRST201, duas FKs entre `clientes` e `grupo_cobranca`) passou por todo o
// CI e derrubou a tela de contas a receber em produção.
//
// COMO FUNCIONA: varre o código atrás do par `.from("tabela")` + `.select("...")`, fica com os
// que têm embed (parênteses) e roda cada um com limit(0) — nenhuma linha trafega, só a
// validação do servidor. O que não consegue parear vira "não analisado" e aparece no relatório,
// para a lacuna ser visível em vez de silenciosa.
//
// Uso: node --env-file=.env.local scripts/db-smoke.mjs   (npm run db:smoke)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const RAIZ = "src";

function arquivos(dir) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (nome === "tests" || nome === "node_modules") continue;
      out.push(...arquivos(caminho));
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      out.push(caminho);
    }
  }
  return out;
}

// Lê o literal de string que começa em `texto[i]` (aspas simples ou duplas). Devolve null se
// não for literal (template, variável, concatenação) — esses viram "não analisado".
function lerLiteral(texto, i) {
  const aspas = texto[i];
  if (aspas !== '"' && aspas !== "'") return null;
  let out = "";
  for (let j = i + 1; j < texto.length; j++) {
    if (texto[j] === "\\") {
      out += texto[j + 1];
      j++;
      continue;
    }
    if (texto[j] === aspas) return out;
    if (texto[j] === "\n") return null;
    out += texto[j];
  }
  return null;
}

function extrair(caminho) {
  const texto = readFileSync(caminho, "utf8");
  const achados = [];
  const re = /\.from\(\s*"([a-zA-Z0-9_]+)"\s*\)/g;
  let m;
  while ((m = re.exec(texto))) {
    const tabela = m[1];
    // O `.select()` do supabase-js vem SEMPRE imediatamente depois do `.from()`. Exigir
    // adjacência (só espaço em branco entre os dois) evita casar o `.from()` de um delete/
    // update com o select de outra consulta adiante — erro que a 1ª versão deste script
    // cometeu, acusando 5 falhas inexistentes em produção.
    let k = m.index + m[0].length;
    while (/\s/.test(texto[k])) k++;
    if (!texto.startsWith(".select(", k)) continue;
    k += ".select(".length;
    while (/\s/.test(texto[k])) k++;
    const literal = lerLiteral(texto, k);
    const linha = texto.slice(0, m.index).split("\n").length;
    if (literal === null) {
      achados.push({ tabela, caminho, linha, select: null });
      continue;
    }
    if (!literal.includes("(")) continue; // sem embed: nada que o PostgREST possa recusar por ambiguidade
    achados.push({ tabela, caminho, linha, select: literal });
  }
  return achados;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !chave) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY no --env-file.");
  process.exit(1);
}
const sb = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

const todos = arquivos(RAIZ).flatMap(extrair);
const comEmbed = todos.filter((a) => a.select);
const naoAnalisados = todos.filter((a) => !a.select);

// Deduplica: o mesmo select repetido em dois lugares é uma consulta só.
const unicos = [...new Map(comEmbed.map((a) => [`${a.tabela}|${a.select}`, a])).values()];

console.log(`${unicos.length} consulta(s) com embed · projeto ${url}\n`);
const falhas = [];
for (const q of unicos) {
  const { error } = await sb.from(q.tabela).select(q.select).limit(0);
  if (error) {
    falhas.push({ ...q, error });
    console.log(`✗ ${q.tabela}  (${q.caminho}:${q.linha})`);
    console.log(`   ${error.code}: ${error.message}`);
    if (error.hint) console.log(`   dica: ${error.hint}`);
  }
}

if (naoAnalisados.length) {
  console.log(`\n${naoAnalisados.length} consulta(s) NÃO ANALISADA(S) (select montado dinamicamente):`);
  for (const a of naoAnalisados) console.log(`   ${a.tabela}  ${a.caminho}:${a.linha}`);
}

if (falhas.length) {
  console.error(`\n✗ ${falhas.length} de ${unicos.length} consulta(s) recusada(s) pelo PostgREST.`);
  process.exit(1);
}
console.log(`\n✓ as ${unicos.length} consulta(s) com embed foram aceitas pelo PostgREST.`);
