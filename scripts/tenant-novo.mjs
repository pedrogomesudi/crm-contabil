// Provisiona um ESCRITÓRIO novo: cria o projeto Supabase, roda as migrations, gera as
// chaves, cria o admin e registra os crons. Idempotente-ish: se parar no meio, use
// --retomar para continuar sem recriar o projeto.
//
// USO
//   SUPABASE_ACCESS_TOKEN=sbp_... SUPABASE_ORG_ID=... \
//   npm run tenant:novo -- --slug contabilx --nome "Contabilidade X" --email admin@x.com.br
//
//   --dry-run   mostra o que faria, sem criar projeto nem gravar arquivo
//   --retomar   reaproveita o tenants/<slug>.env existente (não cria projeto de novo)
//   --regiao    padrão sa-east-1 (São Paulo — os dados ficam no Brasil)
//
// POR QUE NÃO EXISTE `tenant:remover`
// O SUPABASE_ACCESS_TOKEN pode DESTRUIR projetos inteiros da organização. Um script com
// esse poder + um argumento errado num terminal cansado = o banco de um cliente real
// apagado. Criar é automatizável com segurança; destruir fica com o humano, no painel,
// olhando para o nome do projeto.
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  CHAVES_CRIPTO,
  SLUG_RE,
  envDoTenant,
  exigirIgnoradoPeloGit,
  gravarEnv,
  lerEnv,
  lerRegistry,
  mascarar,
  salvarRegistry,
} from "./_tenants.mjs";

const args = process.argv.slice(2);
const opt = (nome, padrao = null) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
};
const flag = (nome) => args.includes(`--${nome}`);

const abortar = (msg) => {
  console.error(`ERRO: ${mascarar(msg)}`);
  process.exit(1);
};

const slug = opt("slug");
const nome = opt("nome");
const email = opt("email");
const regiao = opt("regiao", "sa-east-1");
const dominio = opt("dominio", "seusaldo.ai");
const dbUrlManual = opt("db-url");
const dryRun = flag("dry-run");
const retomar = flag("retomar");

if (!slug || !SLUG_RE.test(slug)) {
  abortar("--slug obrigatório (3-30 chars, [a-z0-9-], vira subdomínio e nome de arquivo).");
}
if (!nome) abortar("--nome obrigatório (razão social do escritório).");
if (!email) abortar("--email obrigatório (e-mail do admin do escritório).");

const appUrl = `https://${slug}.${dominio}`;
const caminhoEnv = envDoTenant(slug);

// TRAVA 1: não sobrescrever a credencial de um escritório vivo.
if (existsSync(caminhoEnv) && !retomar && !dryRun) {
  abortar(`"${caminhoEnv}" já existe. Use --retomar para continuar um provisionamento interrompido.`);
}
// TRAVA 2: não escrever segredo em caminho que o git versiona.
if (!dryRun) exigirIgnoradoPeloGit(caminhoEnv);

const token = process.env.SUPABASE_ACCESS_TOKEN;
const orgId = process.env.SUPABASE_ORG_ID;

const hex32 = () => randomBytes(32).toString("hex");
const senhaForte = () => randomBytes(18).toString("base64url");

// ---------------------------------------------------------------- Supabase Management API
const API = "https://api.supabase.com/v1";

async function api(caminho, init = {}) {
  const r = await fetch(`${API}${caminho}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Supabase API ${r.status} em ${caminho}: ${mascarar(txt).slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

async function criarProjeto(dbPass) {
  console.log(`• Criando o projeto Supabase "${slug}" (região ${regiao})…`);
  const proj = await api("/projects", {
    method: "POST",
    body: JSON.stringify({
      organization_id: orgId,
      name: `saldo-${slug}`,
      region: regiao,
      db_pass: dbPass,
    }),
  });
  const ref = proj.id ?? proj.ref;
  if (!ref) throw new Error("A API não devolveu o project_ref.");
  console.log(`  project_ref: ${ref}`);

  // Provisionar leva minutos: espera ficar saudável antes de migrar.
  process.stdout.write("  aguardando o banco ficar pronto");
  const limite = Date.now() + 10 * 60_000;
  for (;;) {
    if (Date.now() > limite) throw new Error("Timeout: o projeto não ficou ACTIVE_HEALTHY em 10 min.");
    const p = await api(`/projects/${ref}`);
    if (p.status === "ACTIVE_HEALTHY") break;
    process.stdout.write(".");
    await new Promise((s) => setTimeout(s, 10_000));
  }
  console.log(" pronto.");
  return ref;
}

async function chavesDoProjeto(ref) {
  const keys = await api(`/projects/${ref}/api-keys`);
  const pub = keys.find((k) => k.name === "anon" || k.type === "publishable")?.api_key;
  const secret = keys.find((k) => k.name === "service_role" || k.type === "secret")?.api_key;
  if (!pub || !secret) throw new Error("Não consegui ler as chaves do projeto (publishable/service_role).");
  return { pub, secret };
}

// A string do POOLER não pode ser ADIVINHADA: o prefixo do host varia por projeto
// ("aws-0-…" num, "aws-1-…" noutro). Chutar significaria criar o projeto (com custo) e só
// então descobrir que não conecta. Perguntamos ao Supabase; se ele não responder, o
// operador cola a string do painel via --db-url.
async function urlDoPooler(ref, dbPass) {
  try {
    const cfg = await api(`/projects/${ref}/config/database/pooler`);
    const host = cfg?.db_host ?? cfg?.connection_string?.match(/@([^:]+):/)?.[1];
    const porta = cfg?.db_port ?? 5432;
    const usuario = cfg?.db_user ?? `postgres.${ref}`;
    if (host) {
      return `postgresql://${usuario}:${encodeURIComponent(dbPass)}@${host}:${porta}/postgres`;
    }
  } catch (e) {
    console.log(`  (a API não devolveu a config do pooler: ${String(e.message).slice(0, 60)})`);
  }
  return null;
}

async function comBanco(dbUrl, fn) {
  const { readFileSync } = await import("node:fs");
  const pg = (await import("pg")).default;
  const ca = readFileSync(new URL("../supabase/db-ca.crt", import.meta.url), "utf8");
  const cli = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 20_000,
  });
  await cli.connect();
  try {
    return await fn(cli);
  } finally {
    await cli.end();
  }
}

// Falha CEDO: sem conexão, não adianta seguir para as migrations.
async function testarConexao(dbUrl) {
  await comBanco(dbUrl, (cli) => cli.query("select 1"));
}

// pg_cron e pg_net fazem os jobs agendados chamarem o app. Um projeto Supabase NOVO não
// vem com elas ligadas (no de produção, foram habilitadas à mão um dia). Sem isto, o
// bootstrap-cron falha — e a régua e as obrigações nunca rodariam no escritório novo.
async function habilitarExtensoes(dbUrl) {
  await comBanco(dbUrl, async (cli) => {
    await cli.query("create extension if not exists pg_net;");
    await cli.query("create extension if not exists pg_cron;");
  });
}

// ---------------------------------------------------------------- passos locais
function rodar(script, envExtra = {}) {
  console.log(`• ${script}…`);
  const r = spawnSync(
    process.execPath,
    [`--env-file=${caminhoEnv}`, `scripts/${script}.mjs`],
    { stdio: "inherit", env: { ...process.env, ...envExtra } },
  );
  if (r.status !== 0) throw new Error(`"${script}" falhou (código ${r.status}). Corrija e rode com --retomar.`);
}

// ---------------------------------------------------------------- execução
try {
  if (dryRun) {
    console.log("[dry-run] Nada será criado nem gravado.\n");
    console.log(`  escritório : ${nome}`);
    console.log(`  slug       : ${slug}`);
    console.log(`  app        : ${appUrl}`);
    console.log(`  admin      : ${email}`);
    console.log(`  região     : ${regiao}`);
    console.log(`  env        : ${caminhoEnv} (chmod 600, fora do git)`);
    console.log("\n  faria: criar projeto Supabase → migrations → chaves → admin → crons → registry.");
    process.exit(0);
  }

  let env = retomar ? lerEnv(slug) : null;
  const refExistente = opt("project-ref");

  if (!env) {
    if (!token) abortar("Defina SUPABASE_ACCESS_TOKEN (token pessoal do Supabase) no ambiente.");

    let ref;
    if (refExistente) {
      // RECUPERAÇÃO: o projeto já existe (criado numa execução anterior que não gravou o
      // env). Não cria outro; busca as chaves e exige a --db-url do painel (a senha original
      // se perdeu — o operador redefine no painel e cola a URI do Session pooler).
      ref = refExistente;
      if (!dbUrlManual) abortar("recuperação (--project-ref) exige --db-url com a URI do Session pooler.");
      console.log(`• Recuperando o projeto ${ref} (sem criar outro)…`);
    } else {
      if (!orgId) abortar("Defina SUPABASE_ORG_ID (id da organização) no ambiente.");
      const dbPass = senhaForte();
      ref = await criarProjeto(dbPass);
      // Guarda o dbPass já: se algo falhar adiante, --retomar reconstrói a URL a partir dele.
      env = { SUPABASE_DB_PASS: dbPass };
    }

    const { pub, secret } = await chavesDoProjeto(ref);

    // Cada escritório com as SUAS chaves: vazar a de um não compromete os outros.
    // Inclui a NFSE_CERT_KEY (cifra os certificados A1 dos clientes) e os segredos de
    // webhook, que somos nós que escolhemos (o provedor só os repete de volta).
    const cripto = Object.fromEntries(CHAVES_CRIPTO.map((k) => [k, hex32()]));

    env = {
      ...(env ?? {}),
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: pub,
      NEXT_PUBLIC_SITE_URL: appUrl,
      SUPABASE_SERVICE_ROLE_KEY: secret,
      ...cripto,
      ZAPI_WEBHOOK_SECRET: hex32(),
      BOLETO_WEBHOOK_SECRET: hex32(),
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: senhaForte(),
      ADMIN_NOME: nome,
      SUPABASE_PROJECT_REF: ref,
    };
    // GRAVA JÁ, antes de mexer na conexão: se a DB_URL falhar, --retomar acha o env e não
    // cria outro projeto. Foi exatamente o buraco que deixou o primeiro projeto órfão.
    gravarEnv(slug, env);
    console.log(`• Credenciais parciais gravadas em ${caminhoEnv} (chmod 600, fora do git).`);
  } else {
    console.log(`• Retomando com ${caminhoEnv}.`);
  }

  // Garante a SUPABASE_DB_URL (a única coisa que a API às vezes não entrega).
  if (!env.SUPABASE_DB_URL) {
    const ref = env.SUPABASE_PROJECT_REF ?? refExistente;
    const dbUrl = dbUrlManual ?? (env.SUPABASE_DB_PASS ? await urlDoPooler(ref, env.SUPABASE_DB_PASS) : null);
    if (!dbUrl) {
      console.error("\nFalta a string de conexão do banco.");
      console.error("No painel do Supabase → Project Settings → Database → Connection string → **Session pooler**,");
      console.error("copie a URI (se a senha se perdeu, use 'Reset database password' antes) e rode:");
      console.error(`  npm run tenant:novo -- --slug ${slug} --nome "${nome}" --email ${email} --retomar --db-url "<a URI>"`);
      process.exit(1);
    }
    console.log("• Testando a conexão com o banco…");
    try {
      await testarConexao(dbUrl);
    } catch (e) {
      if (/password authentication failed/i.test(e.message)) {
        // Quase sempre é o shell comendo caractere especial da senha ($, !, etc.), não a
        // senha errada. Aspas SIMPLES na --db-url passam o valor literal ao script.
        console.error("\nA senha foi recusada. Se ela tem $ ! ` ou aspas, o shell pode tê-la");
        console.error("corrompido. Rode de novo com ASPAS SIMPLES em volta da --db-url:");
        console.error(`  npm run tenant:novo -- --slug ${slug} --nome "${nome}" --email ${email} --retomar --db-url 'a-URI-COM-A-SENHA'`);
      }
      throw e;
    }
    console.log("  conectou.");
    env.SUPABASE_DB_URL = dbUrl;
    gravarEnv(slug, env);
  }

  rodar("db-migrate");
  rodar("bootstrap-admin");

  console.log("• Habilitando pg_net e pg_cron…");
  try {
    await habilitarExtensoes(env.SUPABASE_DB_URL);
    console.log("  ok.");
  } catch (e) {
    console.error(`  não consegui habilitar as extensões: ${String(e.message).slice(0, 120)}`);
    console.error("  Habilite à mão no painel (Database → Extensions): pg_net e pg_cron. Depois rode com --retomar.");
    process.exit(1);
  }

  rodar("bootstrap-cron", { APP_URL: appUrl, CRON_SECRET: env.CRON_SECRET });

  const reg = lerRegistry();
  reg.escritorios = [
    ...reg.escritorios.filter((e) => e.slug !== slug),
    {
      slug,
      nome,
      appUrl,
      projectRef: env.SUPABASE_PROJECT_REF ?? null,
      criadoEm: new Date().toISOString().slice(0, 10),
    },
  ].sort((a, b) => a.slug.localeCompare(b.slug));
  salvarRegistry(reg);

  console.log(`\n✓ Escritório "${nome}" provisionado.\n`);
  console.log("FALTA FAZER À MÃO (no EasyPanel e no Supabase):");
  console.log(`  1. Criar o app no EasyPanel apontando para o repositório (ramo main).`);
  console.log(`  2. Colar as variáveis de ${caminhoEnv} em Environment (as NEXT_PUBLIC_* como build args).`);
  console.log(`  3. Apontar o domínio ${slug}.${dominio} para o app.`);
  console.log(`  4. No Supabase (Auth → URL Configuration): Site URL = ${appUrl} e Redirect URLs = ${appUrl}/**`);
  console.log(`  5. Implantar e entrar com ${email} (a senha está no arquivo de env — troque no primeiro acesso).`);
  console.log(`  6. Guardar ${caminhoEnv} num cofre de senhas: as chaves de cripto NÃO têm backup em`);
  console.log(`     lugar nenhum — o backup do banco guarda só o texto cifrado, não a chave.`);
  console.log(`\n  As credenciais NÃO foram impressas aqui de propósito. Abra o arquivo localmente e`);
  console.log(`  cole no EasyPanel — nunca por chat, e-mail ou captura de tela.`);
} catch (e) {
  abortar(e.message);
}
