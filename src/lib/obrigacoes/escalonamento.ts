export type NivelEscalonamento = 0 | 1 | 2; // 0 nenhum · 1 líder · 2 sócio
export function nivelEscalonamento(diasAtraso: number, diasLider: number, diasSocio: number): NivelEscalonamento {
  if (diasAtraso >= diasSocio) return 2;
  if (diasAtraso >= diasLider) return 1;
  return 0;
}

export type Cadeia = { liderId: string | null; socioId: string | null };
export function escaladoParaUsuario(nivel: NivelEscalonamento, cadeia: Cadeia, usuarioId: string): boolean {
  if (nivel >= 1 && cadeia.liderId === usuarioId) return true;
  if (nivel >= 2 && cadeia.socioId === usuarioId) return true;
  return false;
}
