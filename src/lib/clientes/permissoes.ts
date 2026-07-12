import type { Papel } from "@/lib/tipos";

// Fonte única das regras de permissão do módulo de clientes (alinhadas à RLS/trigger).

// Quem pode criar cliente (RLS clientes_insert: admin/assistente/contador).
export function podeCriarCliente(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador";
}

// Quem pode atribuir/editar o contador responsável. No INSERT, admin/assistente
// escolhem (contador é forçado a si mesmo pelo trigger). No UPDATE, só admin
// (o trigger congela contador_id para os demais).
export function podeAtribuirContador(papel: Papel | undefined, modo: "novo" | "editar"): boolean {
  if (papel === "admin") return true;
  return modo === "novo" && papel === "assistente";
}

// Quem vê/edita o honorário (clientes_financeiro): admin, financeiro, contador-dono.
export function podeVerHonorario(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "financeiro" || papel === "contador";
}

// Quem gerencia documentos — anexar/excluir (RLS doc_insert: admin/contador/assistente).
// O financeiro só VÊ/baixa (spec §4.2). Como o upload roda via service_role (bypassa
// RLS), esta checagem é o que efetivamente barra o financeiro de anexar.
export function podeGerenciarDocumentos(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "contador" || papel === "assistente";
}

// Quem exclui/restaura cliente (soft delete): apenas admin. A RLS de UPDATE de
// clientes é ampla (admin/assistente/contador-dono), então esta checagem no
// servidor é a trava efetiva — mesmo padrão dos gates de honorário/documentos.
export function podeExcluirCliente(papel: Papel | undefined): boolean {
  return papel === "admin";
}

// Quem configura a NFS-e do cliente-emitente (dados fiscais + certificado): só admin.
// Custódia de certificado é sensível — mesma regra da config do escritório (V5-A).
export function podeConfigurarNfse(papel: Papel | undefined): boolean {
  return papel === "admin";
}

// Configura o WhatsApp (credenciais Z-API): só admin (custódia de credenciais).
export function podeConfigurarWhatsapp(papel: Papel | undefined): boolean {
  return papel === "admin";
}

// Atendimento (inbox WhatsApp): admin, financeiro e contador (a RLS escopa o contador).
export function podeAtender(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "financeiro" || papel === "contador";
}

// Revelar senha de acesso (cofre): só admin e contador.
export function podeRevelarCredencial(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "contador";
}

// Editar o checklist-modelo de onboarding: só admin.
export function podeGerenciarModeloOnboarding(papel: Papel | undefined): boolean {
  return papel === "admin";
}

// Quem vê/gerencia certificados e procurações: quem gerencia o cadastro do cliente.
// O financeiro fica de fora — não é dado financeiro (a RLS também o barra).
export function podeGerenciarVencimentos(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador";
}

// Quem gerencia responsáveis por departamento e a redistribuição em massa de carteira.
export function podeGerenciarResponsaveis(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente";
}

// Quem gerencia processos de legalização/societário (financeiro só lê).
export function podeGerenciarLegalizacao(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador";
}

// Quem gerencia tarefas internas (toda a equipe cria/vê; edição refinada pela RLS).
export function podeGerenciarTarefas(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador" || papel === "financeiro";
}
