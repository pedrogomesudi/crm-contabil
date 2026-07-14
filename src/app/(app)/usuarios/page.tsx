import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { ConviteForm } from "@/components/ConviteForm";
import { BotaoAcao } from "@/components/usuarios/BotaoAcao";
import { PAPEIS_EQUIPE } from "@/lib/tipos";
import { DEPARTAMENTOS } from "@/lib/clientes/departamentos";
import { alterarPapel, definirAtivo, reenviarAcesso, definirSuperior, definirDepartamento } from "./actions";

export const metadata = { title: "Usuários" };

const MSG: Record<string, string> = {
  "ok:papel": "Papel atualizado.",
  "ok:status": "Status atualizado.",
  "ok:reenviado": "Acesso reenviado por e-mail.",
  "erro:self": "Você não pode alterar o próprio papel ou status.",
  "erro:papel": "Papel inválido.",
  "erro:ultimo_admin": "Não é possível remover o último administrador ativo.",
  "erro:1": "Não foi possível concluir a operação.",
};

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const { ok, erro } = await searchParams;
  const feedback = ok ? MSG[`ok:${ok}`] : erro ? MSG[`erro:${erro}`] : null;
  const ehErro = !!erro;

  // Lista todos os usuários via service_role (a RLS de usuarios só lê a própria linha).
  const admin = createAdminSupabase();
  const { data: usuarios, error } = await admin
    .from("usuarios")
    .select("id, nome, email, papel, ativo, superior_id, departamento")
    .order("criado_em")
    .order("id") // desempate determinístico em criado_em iguais
    .limit(200);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Usuários</h1>

      {feedback && (
        <p
          role={ehErro ? "alert" : "status"}
          className={`rounded px-3 py-2 text-sm ${
            ehErro ? "bg-negativo/10 text-negativo" : "bg-verde/10 text-verde"
          }`}
        >
          {feedback}
        </p>
      )}

      <ConviteForm />

      {error ? (
        <p role="alert" className="rounded-lg bg-negativo/10 px-3 py-2 text-sm text-negativo">
          Não foi possível carregar os usuários.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-linha bg-white">
          <table className="w-full text-sm">
            <caption className="sr-only">Lista de usuários do escritório</caption>
            <thead className="bg-creme text-left text-cinza">
              <tr>
                <th className="p-2 font-medium">Nome</th>
                <th className="p-2 font-medium">E-mail</th>
                <th className="p-2 font-medium">Papel</th>
                <th className="p-2 font-medium">Departamento</th>
                <th className="p-2 font-medium">Superior</th>
                <th className="p-2 font-medium">Status</th>
                <th className="p-2 font-medium">Acesso</th>
              </tr>
            </thead>
            <tbody>
              {usuarios?.map((u) => {
                const ehProprio = u.id === perfil.id;
                return (
                  <tr key={u.id} className="border-t border-linha/70 align-top">
                    <td className="p-2 text-texto">{u.nome}</td>
                    <td className="p-2 text-cinza">{u.email}</td>
                    <td className="p-2">
                      {ehProprio ? (
                        <span className="text-cinza-claro">{u.papel} (você)</span>
                      ) : (
                        <form action={alterarPapel.bind(null, u.id)} className="flex gap-1">
                          <select
                            name="papel"
                            defaultValue={u.papel}
                            aria-label={`Papel de ${u.nome}`}
                            className="rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde"
                          >
                            {PAPEIS_EQUIPE.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                          <BotaoAcao
                            className="rounded-lg border border-linha px-3 py-2 text-sm text-cinza hover:bg-creme"
                            rotulo={`Salvar papel de ${u.nome}`}
                            confirmar={
                              u.papel === "admin"
                                ? `Alterar o papel de ${u.nome}? Ele deixará de ser administrador se você escolher outro papel.`
                                : undefined
                            }
                          >
                            Salvar
                          </BotaoAcao>
                        </form>
                      )}
                    </td>
                    <td className="p-2">
                      <form action={definirDepartamento.bind(null, u.id)} className="flex gap-1">
                        <select
                          name="departamento"
                          defaultValue={(u as { departamento: string | null }).departamento ?? ""}
                          aria-label={`Departamento de ${u.nome}`}
                          className="rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde"
                        >
                          <option value="">— nenhum —</option>
                          {DEPARTAMENTOS.map((d) => (
                            <option key={d.valor} value={d.valor}>
                              {d.rotulo}
                            </option>
                          ))}
                        </select>
                        <BotaoAcao className="rounded-lg border border-linha px-3 py-2 text-sm text-cinza hover:bg-creme" rotulo={`Salvar departamento de ${u.nome}`}>
                          Salvar
                        </BotaoAcao>
                      </form>
                    </td>
                    <td className="p-2">
                      {ehProprio ? (
                        <span className="text-cinza-claro">—</span>
                      ) : (
                        <form action={definirSuperior.bind(null, u.id)} className="flex gap-1">
                          <select
                            name="superior_id"
                            defaultValue={(u as { superior_id: string | null }).superior_id ?? ""}
                            aria-label={`Superior de ${u.nome}`}
                            className="rounded-lg border border-linha bg-white px-3 py-2 text-sm text-texto focus:border-verde"
                          >
                            <option value="">— nenhum —</option>
                            {usuarios!
                              .filter((o) => o.id !== u.id)
                              .map((o) => (
                                <option key={o.id} value={o.id}>
                                  {o.nome}
                                </option>
                              ))}
                          </select>
                          <BotaoAcao className="rounded-lg border border-linha px-3 py-2 text-sm text-cinza hover:bg-creme" rotulo={`Salvar superior de ${u.nome}`}>
                            Salvar
                          </BotaoAcao>
                        </form>
                      )}
                    </td>
                    <td className="p-2">
                      {ehProprio ? (
                        <span className="text-cinza-claro">{u.ativo ? "ativo" : "inativo"}</span>
                      ) : (
                        <form action={definirAtivo.bind(null, u.id)}>
                          <BotaoAcao
                            className={`rounded px-2 py-1 ${
                              u.ativo ? "bg-creme text-cinza" : "bg-verde text-white"
                            }`}
                            rotulo={`${u.ativo ? "Desativar" : "Ativar"} ${u.nome}`}
                            confirmar={
                              u.ativo
                                ? `Desativar ${u.nome}? Ele perderá o acesso imediatamente.`
                                : undefined
                            }
                          >
                            {u.ativo ? "Desativar" : "Ativar"}
                          </BotaoAcao>
                        </form>
                      )}
                    </td>
                    <td className="p-2">
                      {ehProprio ? (
                        <span className="text-cinza-claro">—</span>
                      ) : (
                        <form action={reenviarAcesso.bind(null, u.id)}>
                          <BotaoAcao
                            className="rounded-lg border border-linha px-3 py-2 text-sm text-cinza hover:bg-creme"
                            rotulo={`Reenviar acesso para ${u.nome}`}
                            confirmar={`Reenviar o link de acesso para ${u.email}?`}
                          >
                            Reenviar acesso
                          </BotaoAcao>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
