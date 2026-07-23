export type ResultadoEnvio = { ok: boolean; erro?: string; resposta?: unknown };
export type MidiaEnvio = { tipo: "image" | "document"; base64: string; mime: string; nome: string; caption: string };

// O documento do CABEÇALHO do template (header de mídia). O arquivo vai em base64: o upload
// e o media id são detalhe da Meta, resolvidos dentro do adaptador — a camada de política
// não conhece esse conceito.
export type DocumentoTemplate = { base64: string; mime: string; nome: string };

export type TemplateEnvio = { nome: string; idioma: string; params: string[]; documento?: DocumentoTemplate };

export interface ProvedorWhatsapp {
  enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio>;
  enviarMidia(telefone: string, midia: MidiaEnvio): Promise<ResultadoEnvio>;
  statusConexao(): Promise<{ conectado: boolean; erro?: string }>;
  // Capacidade, não nome: a camada de política pergunta isto, nunca "qual provedor é".
  // Assim um terceiro provedor se declara e a política não muda.
  exigeTemplateForaDaJanela: boolean;
  enviarTemplate?(telefone: string, t: TemplateEnvio): Promise<ResultadoEnvio>;
}
