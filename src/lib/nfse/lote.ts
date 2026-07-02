import type { SituacaoLote } from "./tipos";

export function classificarSituacao(documento: string, jaEmitida: boolean): SituacaoLote {
  if (!documento) return "sem_documento";
  if (jaEmitida) return "ja_emitida";
  return "apta";
}
