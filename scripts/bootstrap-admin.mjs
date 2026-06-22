// Cria/promove o primeiro usuário Admin via service_role.
//
// IMPORTANTE: o GoTrue insere auth.users e só DEPOIS popula app_metadata, então
// o trigger handle_new_user (AFTER INSERT) cria o perfil com o papel padrão
// (assistente). Por isso o papel é definido EXPLICITAMENTE aqui, via service_role.
// Fonte única do papel = usuarios.papel (nunca app_metadata).
//
// Uso: defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local e rode:
//   npm run admin:bootstrap
// Para promover um SEGUNDO admin (já existindo um), defina ALLOW_SECOND_ADMIN=1.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const nomeEnv = process.env.ADMIN_NOME;

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email || !password) {
  console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local antes de rodar.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false },
  // timeout de rede: não pendura indefinidamente se a API não responder
  global: {
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
});

function abort(msg) {
  console.error(msg);
  process.exit(1);
}

// Localiza um usuário do Auth pelo e-mail (paginando se necessário).
async function acharAuthUserPorEmail(alvo) {
  const lower = alvo.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) abort(`Falha ao listar usuários: ${error.message}`);
    const achado = data.users.find((u) => u.email?.toLowerCase() === lower);
    if (achado) return achado;
    if (data.users.length < 200) break;
  }
  return null;
}

// 1) Cria o usuário; se já existir, recupera o id e reconcilia senha/confirmação.
let userId;
let criadoAgora = false;
const { data: criado, error: errCreate } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (!errCreate && criado?.user) {
  userId = criado.user.id;
  criadoAgora = true;
} else if (
  errCreate &&
  (errCreate.status === 422 || /already|exist|registered/i.test(errCreate.message))
) {
  const existente = await acharAuthUserPorEmail(email);
  if (!existente) abort("Usuário já existe no Auth, mas não foi possível localizá-lo.");
  userId = existente.id;
  // A-1: reaplica a senha/confirmação para casar com o .env.local
  const { error: errUpd } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
  });
  if (errUpd) abort(`Falha ao reaplicar a senha do admin: ${errUpd.message}`);
  console.log("Usuário já existia — senha reaplicada e promovendo a admin.");
} else {
  abort(`Falha ao criar usuário: ${errCreate?.message ?? "erro desconhecido"}`);
}

// 2) M-1: guarda contra criar um segundo admin sem querer.
const { data: admins, error: errAdmins } = await admin
  .from("usuarios")
  .select("id")
  .eq("papel", "admin")
  .eq("ativo", true);
if (errAdmins) abort(`Falha ao checar admins existentes: ${errAdmins.message}`);
const jaEhAdmin = (admins ?? []).some((a) => a.id === userId);
if ((admins?.length ?? 0) >= 1 && !jaEhAdmin && process.env.ALLOW_SECOND_ADMIN !== "1") {
  abort(
    `Já existe admin no sistema e ${email} não é um deles.\n` +
      "Para promover mesmo assim, rode com ALLOW_SECOND_ADMIN=1.",
  );
}

// 3) Define o papel explicitamente (upsert idempotente; preserva nome existente).
const { data: atual } = await admin.from("usuarios").select("nome").eq("id", userId).maybeSingle();
const nome = nomeEnv || atual?.nome || email;

const { data: perfil, error: errUpsert } = await admin
  .from("usuarios")
  .upsert({ id: userId, email, nome, papel: "admin", ativo: true }, { onConflict: "id" })
  .select("nome, email, papel, ativo")
  .single();
if (errUpsert || !perfil) abort(`Falha ao promover a admin: ${errUpsert?.message ?? "—"}`);

console.log("ADMIN PRONTO");
console.log("  e-mail:", perfil.email);
console.log("  nome:  ", perfil.nome);
console.log("  papel: ", perfil.papel, "| ativo:", perfil.ativo);
if (criadoAgora) {
  console.log("\nUse esse e-mail/senha para logar quando a tela de login (Task 9) existir.");
} else {
  console.log("\nSenha reaplicada a partir do .env.local.");
}
