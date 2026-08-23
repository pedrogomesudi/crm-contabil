import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { HonorariosPagos } from "./HonorariosPagos";
import { listarHonorariosPagos } from "./actions";

// Período padrão: o mês corrente (America/Sao_Paulo). A tela recalcula a lista a
// cada mudança de filtro; aqui só se define o primeiro carregamento.
function mesCorrente(): { inicio: string; fim: string } {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const [ano, mes] = iso.split("-").map(Number);
  const ultimo = new Date(ano!, mes!, 0).getDate(); // dia 0 do mês seguinte = último dia deste mês
  return { inicio: `${iso.slice(0, 7)}-01`, fim: `${iso.slice(0, 7)}-${String(ultimo).padStart(2, "0")}` };
}

export default async function HonorariosPagosPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeGerenciarFinanceiro(perfil.papel)) redirect("/");
  const { inicio, fim } = mesCorrente();
  const linhasIni = await listarHonorariosPagos(inicio, fim);
  return (
    <Container largura="estreita" className="space-y-5 p-4">
      <Voltar href="/financeiro/relatorios" />
      <PageHeader
        titulo="Honorários pagos"
        subtitulo="Honorários recebidos por período de pagamento, com exportação em PDF, Excel e CSV."
      />
      <HonorariosPagos inicio={inicio} fim={fim} linhasIni={linhasIni} />
    </Container>
  );
}
