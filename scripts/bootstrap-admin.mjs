// Cria/promove o primeiro usuário Admin via service_role.
//
// IMPORTANTE: o GoTrue insere auth.users e só DEPOIS popula app_metadata, então
// o trigger handle_new_user (AFTER INSERT) cria o perfil com o papel padrão
// (assistente). Por isso o papel é definido EXPLICITAMENTE aqui, via service_role,
// após a criação — padrão que a Task 12 (convites) também deve seguir.
//
// Uso: defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local e rode:
//   npm run admin:bootstrap
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const nome = process.env.ADMIN_NOME ?? "Administrador";

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email || !password) {
  console.error("Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local antes de rodar.");
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

// 1) Cria o usuário (se já existir, segue para promover).
const { error: errCreate } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  app_metadata: { papel: "admin", nome },
});
if (errCreate && !/already|exist|registered/i.test(errCreate.message)) {
  console.error(`Falha ao criar usuário: ${errCreate.message}`);
  process.exit(1);
}
if (errCreate) {
  console.log("Usuário já existia — promovendo a admin.");
}

// 2) Localiza o perfil criado pelo trigger e DEFINE o papel explicitamente.
const { data: perfil, error: errSel } = await admin
  .from("usuarios")
  .select("id")
  .eq("email", email)
  .single();
if (errSel || !perfil) {
  console.error(`Perfil não encontrado em usuarios: ${errSel?.message ?? "—"}`);
  process.exit(1);
}

const { data: atualizado, error: errUpd } = await admin
  .from("usuarios")
  .update({ papel: "admin", nome, ativo: true })
  .eq("id", perfil.id)
  .select("nome, email, papel, ativo")
  .single();
if (errUpd || !atualizado) {
  console.error(`Falha ao promover a admin: ${errUpd?.message ?? "—"}`);
  process.exit(1);
}

console.log("ADMIN PRONTO");
console.log("  e-mail:", atualizado.email);
console.log("  nome:  ", atualizado.nome);
console.log("  papel: ", atualizado.papel, "| ativo:", atualizado.ativo);
console.log("\nUse esse e-mail/senha para logar quando a tela de login (Task 9) existir.");
