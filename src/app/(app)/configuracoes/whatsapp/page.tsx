import { Container } from "@/components/ui/Container";
import { Voltar } from "@/components/ui/Voltar";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { FormWhatsapp } from "./Formularios";
import { carregarConfigWhatsapp, listarTemplatesDisponiveis } from "./actions";
import { TemplatesPorFluxo } from "@/components/whatsapp/TemplatesPorFluxo";
import type { FluxoProativo } from "@/lib/whatsapp/politica-proativo";

export default async function ConfigWhatsappPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeConfigurarWhatsapp(perfil.papel)) redirect("/");
  const { templatesPorFluxo, ...cfg } = await carregarConfigWhatsapp();

  // A seção de templates só existe na oficial — a Z-API não tem esse conceito.
  // O status vem AO VIVO da Meta: copiá-lo para o banco criaria uma segunda verdade.
  const lista = cfg.provedor === "oficial" ? await listarTemplatesDisponiveis() : null;

  return (
    <Container largura="estreita" className="space-y-4 p-4">
      <Voltar href="/configuracoes" label="Configurações" />
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">WhatsApp</h1>
      <FormWhatsapp {...cfg} />
      {cfg.provedor === "oficial" && (
        <TemplatesPorFluxo
          configurados={templatesPorFluxo as Partial<Record<FluxoProativo, { nome: string; idioma: string }>>}
          disponiveis={lista && "templates" in lista ? lista.templates : []}
          erroListagem={lista && "erro" in lista ? lista.erro : null}
        />
      )}
    </Container>
  );
}
