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
