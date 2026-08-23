import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { HonorariosAbertos } from "./HonorariosAbertos";
import { listarHonorariosAbertos } from "./actions";

// Período padrão: o mês corrente (America/Sao_Paulo). A tela recalcula a lista a
// cada mudança de filtro; aqui só se define o primeiro carregamento.
function mesCorrente(): { inicio: string; fim: string } {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const [ano, mes] = iso.split("-").map(Number);
  const ultimo = new Date(ano!, mes!, 0).getDate(); // dia 0 do mês seguinte = último dia deste mês
  return { inicio: `${iso.slice(0, 7)}-01`, fim: `${iso.slice(0, 7)}-${String(ultimo).padStart(2, "0")}` };
}

export default async function HonorariosAbertosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const { inicio, fim } = mesCorrente();
  const linhasIni = await listarHonorariosAbertos(inicio, fim);
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader
        titulo="Honorários em aberto"
        subtitulo="Honorários ainda não pagos por período de vencimento, com situação de atraso e exportação em PDF, Excel e CSV."
      />
      <HonorariosAbertos inicio={inicio} fim={fim} linhasIni={linhasIni} />
    </Container>
  );
}
