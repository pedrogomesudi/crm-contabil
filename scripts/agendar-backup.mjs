// Gera e instala um LaunchAgent (launchd) que roda o backup DIARIAMENTE no macOS.
// launchd é nativo e, se o Mac estava dormindo na hora, roda ao acordar (não pula o dia).
//
//   node scripts/agendar-backup.mjs --slug gomes [--hora 9]
//   node scripts/agendar-backup.mjs --slug gomes --remover
//
// O plist NÃO contém segredo: os segredos vivem em tenants/<slug>.env (lido pelo backup).
import { writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d;
};
const flag = (n) => args.includes(`--${n}`);
const abortar = (m) => {
  console.error(`ERRO: ${m}`);
  process.exit(1);
};

const slug = opt("slug");
if (!slug || !/^[a-z0-9-]{3,30}$/.test(slug)) abortar("--slug obrigatório ([a-z0-9-]).");
const hora = Number(opt("hora", "9"));
if (!Number.isInteger(hora) || hora < 0 || hora > 23) abortar("--hora 0..23.");

const label = `ai.seusaldo.backup.${slug}`;
const plistPath = join(homedir(), "Library", "LaunchAgents", `${label}.plist`);
const target = `gui/${process.getuid()}/${label}`;

// --remover: descarrega e apaga.
if (flag("remover")) {
  spawnSync("launchctl", ["bootout", `gui/${process.getuid()}`, plistPath], { stdio: "ignore" });
  if (existsSync(plistPath)) rmSync(plistPath);
  console.log(`✓ Agendamento removido (${label}).`);
  process.exit(0);
}

if (!existsSync(join(RAIZ, "tenants", `${slug}.env`))) {
  abortar(`tenants/${slug}.env não existe — provisione ou adote o escritório antes.`);
}

const node = process.execPath; // caminho absoluto do node atual
const logDir = join(RAIZ, "backups", slug);
mkdirSync(logDir, { recursive: true });
const log = join(logDir, "backup.log");

// launchd roda com ambiente mínimo: o PATH inclui o libpq (pg_dump) e o node/gzip.
const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${node}</string>
    <string>--env-file=${join(RAIZ, "tenants", `${slug}.env`)}</string>
    <string>${join(RAIZ, "scripts", "backup-dump.mjs")}</string>
    <string>--slug</string><string>${slug}</string>
  </array>
  <key>WorkingDirectory</key><string>${RAIZ}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>${hora}</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>${log}</string>
  <key>StandardErrorPath</key><string>${log}</string>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
`;

mkdirSync(dirname(plistPath), { recursive: true });
writeFileSync(plistPath, plist);

// Recarrega (bootout se já existir, depois bootstrap).
spawnSync("launchctl", ["bootout", target], { stdio: "ignore" });
const r = spawnSync("launchctl", ["bootstrap", `gui/${process.getuid()}`, plistPath], { encoding: "utf8" });
if (r.status !== 0) {
  console.error(r.stderr || r.stdout);
  abortar("launchctl bootstrap falhou. Verifique a mensagem acima.");
}

console.log(`✓ Backup agendado: todo dia às ${String(hora).padStart(2, "0")}:00 (launchd).`);
console.log(`  plist: ${plistPath}`);
console.log(`  log  : ${log}`);
console.log("\n  Se o Mac estiver dormindo na hora, roda ao acordar (não pula o dia).");
console.log(`  Testar agora:  launchctl kickstart -k ${target}`);
console.log(`  Ver status:    launchctl print ${target} | grep -i state`);
console.log(`  Remover:       node scripts/agendar-backup.mjs --slug ${slug} --remover`);
