// Cria a tag anotada da release a partir do package.json — que o teste `versao.test.ts`
// já amarrou ao CHANGELOG. Digitar o número de novo aqui seria mais um lugar para ele
// divergir; o script lê, confere onde está e diz o que fazer depois.
//
//   npm run release:tag        (depois do PR de release entrar no main)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// execFile + array (sem shell): a `version` sai de um arquivo e vai parar num comando —
// interpolar isso numa string de shell seria injeção esperando acontecer.
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const morrer = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) morrer(`versão inválida no package.json: "${version}" (esperado x.y.z).`);
const tag = `v${version}`;

// A tag aponta para o merge commit JÁ no main: taguear develop marcaria um commit que
// não é o que foi entregue.
const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") morrer(`você está em "${branch}" — a tag da release sai do main (git switch main && git pull).`);

if (git("status", "--porcelain"))
  morrer("há mudanças não commitadas — a tag marcaria um estado que não existe no remoto.");

const local = git("rev-parse", "HEAD");
if (local !== git("rev-parse", "origin/main"))
  morrer("o main local difere do origin/main — rode `git pull` antes (a tag deve marcar o que foi publicado).");

if (git("tag", "--list").split("\n").includes(tag))
  morrer(`a tag ${tag} já existe. Suba a versão no package.json + CHANGELOG antes de lançar de novo.`);

execFileSync("git", ["tag", "-a", tag, "-m", tag], { stdio: "inherit" });
console.log(`✓ tag ${tag} criada em ${local.slice(0, 7)}`);
console.log(`  publique:  git push origin ${tag}`);
console.log(`  release:   gh release create ${tag} --notes-from-tag`);
