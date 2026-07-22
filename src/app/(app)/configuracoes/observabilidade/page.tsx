import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { EmptyState } from "@/components/ui/EmptyState";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { TabelaErros, type EventoErroView } from "@/components/observabilidade/TabelaErros";

export const metadata = { title: "Observabilidade" };

export default async function ObservabilidadePage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");

  const admin = createAdminSupabase();
  const { data } = await admin
    .from("evento_erro")
    .select("id, criado_em, mensagem, rota, metodo, digest, stack")
    .order("criado_em", { ascending: false })
    .limit(100);

  const eventos: EventoErroView[] = (data ?? []).map((e) => ({
    id: e.id as string,
    criadoEm: e.criado_em as string,
    mensagem: e.mensagem as string,
    rota: (e.rota as string | null) ?? null,
    metodo: (e.metodo as string | null) ?? null,
    digest: (e.digest as string | null) ?? null,
    stack: (e.stack as string | null) ?? null,
  }));

  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <PageHeader titulo="Observabilidade" subtitulo="Erros do sistema registrados, para diagnóstico" />
      {eventos.length === 0 ? (
        <EmptyState titulo="Nenhum erro registrado" descricao="Erros server-side aparecem aqui quando ocorrem." />
      ) : (
        <TabelaErros eventos={eventos} />
      )}
    </Container>
  );
}
