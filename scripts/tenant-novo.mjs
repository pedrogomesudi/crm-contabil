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

  if (!env) {
    if (!token) abortar("Defina SUPABASE_ACCESS_TOKEN (token pessoal do Supabase) no ambiente.");
    if (!orgId) abortar("Defina SUPABASE_ORG_ID (id da organização) no ambiente.");

    const dbPass = senhaForte();
    const ref = await criarProjeto(dbPass);
    const { pub, secret } = await chavesDoProjeto(ref);

    // Cada escritório com as SUAS chaves: vazar a de um não compromete os outros.
    // Inclui a NFSE_CERT_KEY (cifra os certificados A1 dos clientes) e os segredos de
    // webhook, que somos nós que escolhemos (o provedor só os repete de volta).
    const cripto = Object.fromEntries(CHAVES_CRIPTO.map((k) => [k, hex32()]));
    const webhooks = {
      ZAPI_WEBHOOK_SECRET: hex32(),
      BOLETO_WEBHOOK_SECRET: hex32(),
    };

    env = {
      NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: pub,
      NEXT_PUBLIC_SITE_URL: appUrl,
      SUPABASE_SERVICE_ROLE_KEY: secret,
      // Session pooler (o runner de migrations exige; o Transaction pooler não serve).
      SUPABASE_DB_URL: `postgresql://postgres.${ref}:${encodeURIComponent(dbPass)}@aws-0-${regiao}.pooler.supabase.com:5432/postgres`,
      ...cripto,
      ...webhooks,
      ADMIN_EMAIL: email,
      ADMIN_PASSWORD: senhaForte(),
      ADMIN_NOME: nome,
      SUPABASE_PROJECT_REF: ref,
    };
    gravarEnv(slug, env);
    console.log(`• Credenciais gravadas em ${caminhoEnv} (chmod 600, fora do git).`);
  } else {
    console.log(`• Retomando com ${caminhoEnv}.`);
  }

  rodar("db-migrate");
  rodar("bootstrap-admin");
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
