// Cria o primeiro usuário Admin via service_role (Auth cuida do hash da senha).
// O trigger handle_new_user cria o perfil em `usuarios` com papel 'admin'
// (lido de app_metadata). Idempotente-ish: avisa se o e-mail já existir.
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
  console.error(
    "Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env.local antes de rodar.\n" +
      "Senha forte recomendada (>= 8 caracteres).",
  );
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true, // sem SMTP: já entra confirmado
  app_metadata: { papel: "admin", nome },
});

if (error) {
  console.error(`Falha ao criar usuário: ${error.message}`);
  console.error("(Se o e-mail já existir, o admin provavelmente já foi criado.)");
  process.exit(1);
}

// Confirma que o trigger criou o perfil com papel admin
const { data: perfil, error: errPerfil } = await admin
  .from("usuarios")
  .select("nome, email, papel, ativo")
  .eq("id", data.user.id)
  .single();

if (errPerfil || !perfil) {
  console.error(
    "Usuário criado no Auth, mas o perfil em `usuarios` não foi encontrado " +
      `(trigger handle_new_user?). Detalhe: ${errPerfil?.message ?? "sem perfil"}`,
  );
  process.exit(1);
}

if (perfil.papel !== "admin") {
  console.error(`Perfil criado, mas papel = "${perfil.papel}" (esperado "admin").`);
  process.exit(1);
}

console.log("ADMIN CRIADO COM SUCESSO");
console.log("  e-mail:", perfil.email);
console.log("  nome:  ", perfil.nome);
console.log("  papel: ", perfil.papel, "| ativo:", perfil.ativo);
console.log("\nUse esse e-mail/senha para logar quando a tela de login (Task 9) existir.");
