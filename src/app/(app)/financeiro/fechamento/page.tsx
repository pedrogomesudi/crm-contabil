import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Conferencia } from "./Conferencia";
import { carregarConferencia } from "./actions";

// Competência padrão: mês corrente (America/Sao_Paulo).
function competenciaCorrente(): string {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return `${iso.slice(0, 7)}-01`;
}

export default async function FechamentoPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const competencia = competenciaCorrente();
  const itens = await carregarConferencia(competencia);
  return (
    <Container largura="larga" className="space-y-5 p-4">
      <Voltar href="/financeiro/cadastros" />
      <PageHeader
        titulo="Conferência do fechamento"
        subtitulo="Honorário × título × nota fiscal × boleto de cada cliente. Só envie o que estiver Pronto."
      />
      <Conferencia competenciaIni={competencia} itensIni={itens} />
    </Container>
  );
}
