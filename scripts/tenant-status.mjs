// Lista os escritórios do registry e mostra versão/saúde de cada /api/health.
//   npm run tenant:status
//   npm run tenant:status -- --esperado 6.63.0        (sinaliza quem não implantou)
//   npm run tenant:status -- --timeout 5000
// Sai com código 1 se algum tenant estiver fora do ar ou desatualizado.
import { lerRegistry } from "./_tenants.mjs";
import { classificar, resumo } from "./_tenant-status.mjs";

const args = process.argv.slice(2);
const opt = (nome, padrao = null) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : padrao;
};

const esperado = opt("esperado");
const timeout = Number(opt("timeout", "8000")) || 8000;

function listaEscritorios() {
  const reg = lerRegistry();
  const lista = Array.isArray(reg) ? reg : (reg.escritorios ?? []);
  return lista.filter((e) => e && e.appUrl);
}

async function consultar(appUrl) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(`${appUrl.replace(/\/$/, "")}/api/health`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, versao: null };
    const j = await res.json().catch(() => ({}));
    return { ok: true, versao: j?.versao ?? null };
  } catch {
    return { ok: false, versao: null };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const escritorios = listaEscritorios();
  if (escritorios.length === 0) {
    console.log("Nenhum escritório no registry (tenants/registry.json).");
    return;
  }
  const linhas = await Promise.all(
    escritorios.map(async (e) => {
      const health = await consultar(e.appUrl);
      return {
        slug: e.slug ?? "—",
        appUrl: e.appUrl,
        versao: health.versao ?? "—",
        status: classificar(health, esperado),
      };
    }),
  );

  const w = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(`${w("SLUG", 16)} ${w("URL", 34)} ${w("VERSÃO", 10)} STATUS`);
  console.log("-".repeat(74));
  for (const l of linhas) console.log(`${w(l.slug, 16)} ${w(l.appUrl, 34)} ${w(l.versao, 10)} ${l.status}`);

  const r = resumo(linhas);
  console.log("-".repeat(74));
  console.log(
    `${r.total} escritório(s)` +
      (esperado ? ` · esperado ${esperado}` : "") +
      ` · fora do ar: ${r.fora} · desatualizados: ${r.desatualizados}`,
  );
  if (r.fora > 0 || r.desatualizados > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
