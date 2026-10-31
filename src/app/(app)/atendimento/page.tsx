import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { podeAtender } from "@/lib/clientes/permissoes";
import { Inbox } from "./Inbox";
import { listarConversas } from "./actions";

// DIAGNÓSTICO TEMPORÁRIO (remover quando a causa do travamento no iOS estiver identificada).
// A tela não abre no celular: a aba é encerrada pelo navegador, sempre, em qualquer navegador e
// em qualquer orientação — no computador funciona. Sem acesso ao console do aparelho, estes
// parâmetros permitem bissectar a causa abrindo três endereços no próprio celular:
//   ?diag=vazio           → renderiza só o cabeçalho, sem o Inbox
//   ?diag=sem-tempo-real  → sem WebSocket e sem a reconsulta de 30s
//   ?limite=50            → carrega 50 mensagens em vez de 500
// O primeiro que carregar aponta o culpado. Sem parâmetro, comportamento normal.
export default async function AtendimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ diag?: string; limite?: string }>;
}) {
  const perfil = await getPerfilAtual();
  if (!perfil || !podeAtender(perfil.papel)) redirect("/");
  const { diag, limite } = await searchParams;
  if (diag === "vazio") {
    return (
      <div className="p-4">
        <h1 className="font-display text-lg font-semibold">Atendimento — modo diagnóstico</h1>
        <p className="mt-2 text-sm text-cinza">
          Se esta tela carregou, a rota e o layout estão sãos: o problema está no conteúdo do Inbox.
        </p>
      </div>
    );
  }
  const n = Number(limite);
  const conversas = await listarConversas(Number.isInteger(n) && n > 0 ? n : 500);
  // Cancela o padding do <main> e preenche a viewport. Offset do topo mobile é a barra da Sidebar.
  //
  // `svh`, NÃO `dvh`: a altura dinâmica muda quando a barra do navegador se esconde ao rolar, e no
  // iOS isso realimenta o layout — a barra some, a altura cresce, o conteúdo reflui, a barra volta.
  // O WebKit recalcula até o sistema encerrar a aba, e a tela vira "This page couldn't load". Só
  // acontece em celular, porque só ali a barra se esconde. `svh` é a viewport MENOR: estável.
  return (
    <div className="-m-4 h-[calc(100svh-3.5rem)] overflow-x-hidden md:-m-6 md:h-screen">
      <Inbox inicial={conversas} semTempoReal={diag === "sem-tempo-real"} />
    </div>
  );
}
