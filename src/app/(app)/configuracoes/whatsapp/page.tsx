import { Container } from "@/components/ui/Container";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeConfigurarWhatsapp } from "@/lib/clientes/permissoes";
import { FormWhatsapp } from "./Formularios";
import { carregarConfigWhatsapp } from "./actions";

export default async function ConfigWhatsappPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeConfigurarWhatsapp(perfil.papel)) redirect("/");
  const cfg = await carregarConfigWhatsapp();
  return (
    <Container largura="estreita" className="space-y-4 p-4">
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">WhatsApp</h1>
      <FormWhatsapp {...cfg} />
    </Container>
  );
}
