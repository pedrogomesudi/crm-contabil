// Registro dos escritórios (multi-tenant: UM BANCO E UM APP POR ESCRITÓRIO).
//
//   tenants/registry.json  -> metadados NÃO sensíveis (versionado)
//   tenants/<slug>.env     -> segredos do escritório (gitignored, chmod 600)
//
// Separar os dois é o que permite versionar a LISTA de escritórios sem versionar as
// CREDENCIAIS deles. Uma service_role commitada não se desfaz: mesmo removendo o commit,
// a chave já esteve lá e teria de ser rotacionada em todo lugar.
import { readFileSync, writeFileSync, existsSync, chmodSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
export const DIR_TENANTS = join(RAIZ, "tenants");
export const REGISTRY = join(DIR_TENANTS, "registry.json");

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

// As 5 chaves que cada escritório precisa ter as SUAS (vazar a de um não compromete os outros).
export const CHAVES_CRIPTO = [
  "CRON_SECRET",
  "WHATSAPP_CRIPTO_KEY",
  "ONBOARDING_CRIPTO_KEY",
  "BOLETO_CRIPTO_KEY",
  "EMAIL_CRIPTO_KEY",
];

export function lerRegistry() {
  if (!existsSync(REGISTRY)) return { escritorios: [] };
  return JSON.parse(readFileSync(REGISTRY, "utf8"));
}

export function salvarRegistry(reg) {
  mkdirSync(DIR_TENANTS, { recursive: true });
  writeFileSync(REGISTRY, JSON.stringify(reg, null, 2) + "\n");
}

export function envDoTenant(slug) {
  return join(DIR_TENANTS, `${slug}.env`);
}

// TRAVA DE SEGURANÇA: nunca escrever segredo num caminho que o git não ignora.
// Se o .gitignore não estiver no lugar, aborta ANTES de a credencial existir.
export function exigirIgnoradoPeloGit(caminho) {
  try {
    execFileSync("git", ["check-ignore", "-q", caminho], { cwd: RAIZ });
  } catch {
    throw new Error(
      `ABORTADO: "${caminho}" NÃO está no .gitignore. Não escrevo segredo em caminho versionável.`,
    );
  }
}

// Grava o .env do tenant com permissão restrita. NUNCA imprime o conteúdo.
export function gravarEnv(slug, vars) {
  mkdirSync(DIR_TENANTS, { recursive: true });
  const caminho = envDoTenant(slug);
  exigirIgnoradoPeloGit(caminho);
  const corpo = Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(caminho, `${corpo}\n`, { mode: 0o600 });
  chmodSync(caminho, 0o600);
  return caminho;
}

// Lê o .env de um tenant para um objeto (sem exportar para process.env).
export function lerEnv(slug) {
  const caminho = envDoTenant(slug);
  if (!existsSync(caminho)) return null;
  const out = {};
  for (const linha of readFileSync(caminho, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(linha.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// Mascara segredos conhecidos em qualquer saída de log.
export const mascarar = (s) =>
  String(s ?? "").replace(/(sbp_|sb_secret_|sb_publishable_|eyJ)[A-Za-z0-9._-]{6,}/g, "$1***");
