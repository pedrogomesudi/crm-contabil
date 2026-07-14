// Recria (idempotentemente) os jobs pg_cron da plataforma.
//
// POR QUE ESTE SCRIPT EXISTE
// Dois dos três jobs (régua de cobrança e geração de obrigações) fazem
// net.http_post com o CRON_SECRET no header. Colocá-los numa migration exigiria
// commitar o segredo no repositório. Por isso eles vivem aqui: o segredo vem do
// ambiente, nunca do git.
//
// Um restore de backup pode deixar `cron.job` vazio. Sem estes jobs, a régua de
// cobrança e a geração mensal de obrigações param SILENCIOSAMENTE — a falha só
// apareceria no primeiro prazo perdido. Rode este script após qualquer restore.
//
// USO
//   CRON_SECRET=<segredo> APP_URL=https://app.seusaldo.ai npm run cron:bootstrap
//   ... adicione --dry-run para apenas comparar com o estado atual, sem gravar.
//
// `cron.schedule(nome, agenda, comando)` faz upsert pelo nome do job, então
// rodar várias vezes é seguro: o jobid é preservado.
import { makeClient } from "./_db.mjs";

const dryRun = process.argv.includes("--dry-run");
const secret = process.env.CRON_SECRET;
const appUrl = (process.env.APP_URL ?? "").replace(/\/+$/, "");

function abort(msg) {
  console.error("ERRO:", msg);
  process.exit(1);
}

if (!secret) abort("Defina CRON_SECRET (o mesmo valor configurado no app).");
if (!appUrl) abort("Defina APP_URL (ex.: https://app.seusaldo.ai).");
if (!/^https:\/\//.test(appUrl)) {
  abort(`APP_URL deve ser https e pública — recebido "${appUrl}". O cron roda no banco, não na sua máquina.`);
}

// Escapa aspas simples para interpolar com segurança em literais SQL.
const esc = (s) => String(s).replace(/'/g, "''");

// Chamada HTTP autenticada, do banco para a rota de cron do app (via pg_net).
const httpPost = (caminho, comBody) =>
  `select net.http_post(url := '${esc(appUrl)}/api/cron/${caminho}', ` +
  `headers := jsonb_build_object('Authorization', 'Bearer ${esc(secret)}', 'Content-Type', 'application/json')` +
  (comBody ? `, body := '{}'::jsonb` : "") +
  `);`;

// Fonte única dos jobs. Reproduz fielmente o que roda em produção.
const JOBS = [
  {
    nome: "gerar-mensalidades-mensal",
    agenda: "0 6 1 * *",
    comando: "select gerar_mensalidades_automatico()",
    nota: "também criado pela migration 0031; aqui para sobreviver a um restore",
  },
  {
    nome: "regua-cobranca-diaria",
    agenda: "0 12 * * *",
    comando: httpPost("regua-cobranca", false),
    nota: "sem body (fiel ao job de produção)",
  },
  {
    nome: "gerar-obrigacoes-mensal",
    agenda: "0 12 1 * *",
    comando: httpPost("gerar-obrigacoes", true),
    nota: "com body '{}' (fiel ao job de produção)",
  },
  {
    nome: "tarefas-recorrentes-diaria",
    agenda: "0 9 * * *",
    comando: httpPost("tarefas-recorrentes", true),
    nota: "gera as ocorrências das tarefas recorrentes (RF-040)",
  },
];

// Nunca imprime o segredo.
const mascarar = (cmd) => cmd.replace(/Bearer [^']+/g, "Bearer ***");

// Compara comandos ignorando espaçamento: o job gravado no banco pode ter sido
// escrito à mão com espaços diferentes, sem que o SQL mude. Nenhum literal nosso
// (URL, nomes de header, token) depende de espaço interno para o sentido.
const mesmoComando = (a, b) => a.replace(/\s+/g, "") === b.replace(/\s+/g, "");

const db = makeClient();
await db.connect();

try {
  // As extensões precisam existir; criá-las exige privilégio que não assumimos aqui.
  const { rows: exts } = await db.query(
    "select extname from pg_extension where extname in ('pg_cron','pg_net')",
  );
  const nomes = exts.map((e) => e.extname);
  for (const ext of ["pg_cron", "pg_net"]) {
    if (!nomes.includes(ext)) abort(`Extensão "${ext}" ausente. Habilite-a no Supabase antes de rodar.`);
  }

  const { rows: atuais } = await db.query("select jobid, jobname, schedule, command, active from cron.job");
  const porNome = new Map(atuais.map((j) => [j.jobname, j]));

  let mudancas = 0;
  for (const job of JOBS) {
    const atual = porNome.get(job.nome);
    let situacao;
    if (!atual) situacao = "AUSENTE — será criado";
    else if (atual.schedule !== job.agenda || !mesmoComando(atual.command, job.comando))
      situacao = "DIVERGENTE — será atualizado";
    else if (!atual.active) situacao = "INATIVO — será reativado";
    else situacao = "ok (inalterado)";

    if (situacao !== "ok (inalterado)") mudancas++;
    console.log(`\n• ${job.nome}  [${job.agenda}]`);
    console.log(`  situação: ${situacao}${atual ? ` (jobid ${atual.jobid})` : ""}`);
    console.log(`  comando:  ${mascarar(job.comando)}`);
    if (job.nota) console.log(`  nota:     ${job.nota}`);

    if (!dryRun) {
      await db.query("select cron.schedule($1, $2, $3)", [job.nome, job.agenda, job.comando]);
    }
  }

  if (dryRun) {
    console.log(`\n[dry-run] Nada foi gravado. ${mudancas} job(s) seriam alterados.`);
  } else {
    const { rows: depois } = await db.query(
      "select jobid, jobname, schedule, active from cron.job order by jobid",
    );
    console.log("\nEstado final de cron.job:");
    for (const j of depois) {
      console.log(`  jobid ${j.jobid}  ${j.jobname}  [${j.schedule}]  ativo: ${j.active}`);
    }
    console.log(`\nOK — ${JOBS.length} job(s) garantidos (${mudancas} alterado(s)).`);
  }
} finally {
  await db.end();
}
