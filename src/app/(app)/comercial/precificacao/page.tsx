import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeCriarCliente } from "@/lib/clientes/permissoes";
import { PageHeader } from "@/components/ui/PageHeader";
import { Voltar } from "@/components/ui/Voltar";
import { Calculadora } from "./Calculadora";
import { carregarPrecificacao } from "../../configuracoes/precificacao/actions";
import { paraConfigPreco } from "@/lib/comercial/precificacao";

export const metadata = { title: "Precificação" };

export default async function PrecificacaoCalcPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeCriarCliente(perfil.papel)) redirect("/");
  const view = await carregarPrecificacao();
  const config = paraConfigPreco(view);
  return (
    <Container largura="padrao" className="space-y-5 p-4">
      <Voltar href="/comercial" label="Comercial" />
      <PageHeader titulo="Precificação" subtitulo="Simulador de honorários" />
      <Calculadora
        config={config}
        complexidades={view.complexidades.map((c) => ({ id: c.id, nome: c.nome }))}
        servicos={view.servicos
          .filter((s) => s.ativo)
          .map((s) => ({
            id: s.id,
            nome: s.nome,
            valor: s.valor,
            recorrencia: s.recorrencia === "mensal" ? "mensal" : "unico",
          }))}
      />
    </Container>
  );
}
