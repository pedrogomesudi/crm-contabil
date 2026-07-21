// Dias de calendário entre duas datas ISO (usa só o trecho YYYY-MM-DD), b - a.
function diasEntre(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bIso.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

// Card de NPS é "devido" quando a coleta está ligada e o cliente nunca respondeu, ou
// respondeu há pelo menos `periodicidadeDias`. Lazy: calculado no acesso ao portal.
export function npsDevido(args: {
  ativo: boolean;
  periodicidadeDias: number;
  ultimaRespostaIso: string | null;
  hojeIso: string;
}): boolean {
  if (!args.ativo) return false;
  if (!args.ultimaRespostaIso) return true;
  return diasEntre(args.ultimaRespostaIso, args.hojeIso) >= args.periodicidadeDias;
}
