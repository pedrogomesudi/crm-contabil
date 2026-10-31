// Janela mínima entre duas reconsultas completas da lista de conversas. Cada uma traz até 500
// mensagens; no celular, `visibilitychange` dispara a cada bloqueio de tela, troca de app ou
// puxada da barra de notificações — sem janela, era uma busca completa por evento.
export const INTERVALO_MINIMO_MS = 30_000;

// Decide se vale reconsultar agora. Pura e testável de propósito: a regra é fácil de errar e
// cara quando erra (bateria e memória do aparelho), e aqui ela fica à vista.
export function deveReconsultar(ultimaEmMs: number | null, agoraEmMs: number, abaVisivel: boolean): boolean {
  // Aba em segundo plano não precisa de dado fresco: quando voltar, o visibilitychange resolve.
  if (!abaVisivel) return false;
  if (ultimaEmMs === null) return true;
  return agoraEmMs - ultimaEmMs >= INTERVALO_MINIMO_MS;
}
