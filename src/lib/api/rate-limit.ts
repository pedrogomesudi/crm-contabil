export type EstadoRate = { janelaInicio: number; contador: number };

// Janela fixa: decisão pura, testável. O chamador persiste o `estado`.
export function decidirRate(
  estado: EstadoRate | undefined,
  agora: number,
  limite: number,
  janelaMs: number,
): { permitido: boolean; estado: EstadoRate; restanteMs: number } {
  if (!estado || agora - estado.janelaInicio >= janelaMs) {
    return { permitido: true, estado: { janelaInicio: agora, contador: 1 }, restanteMs: 0 };
  }
  if (estado.contador >= limite) {
    return { permitido: false, estado, restanteMs: janelaMs - (agora - estado.janelaInicio) };
  }
  return { permitido: true, estado: { ...estado, contador: estado.contador + 1 }, restanteMs: 0 };
}

const LIMITE = 120;
const JANELA_MS = 60000;
// Em memória: o deploy é 1 container por escritório. Reinício zera os contadores (aceitável).
const mapa = new Map<string, EstadoRate>();

export function verificarRate(apiKeyId: string): { permitido: boolean; restanteMs: number } {
  const r = decidirRate(mapa.get(apiKeyId), Date.now(), LIMITE, JANELA_MS);
  mapa.set(apiKeyId, r.estado);
  return { permitido: r.permitido, restanteMs: r.restanteMs };
}
