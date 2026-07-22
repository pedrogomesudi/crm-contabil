export type ResultadoEnvio = { ok: boolean; erro?: string; resposta?: unknown };
export type MidiaEnvio = { tipo: "image" | "document"; base64: string; mime: string; nome: string; caption: string };

export interface ProvedorWhatsapp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(telefone: string, midia: MidiaEnvio): Promise<ResultadoEnvio>;
  statusConexao(): Promise<{ conectado: boolean; erro?: string }>;
}
