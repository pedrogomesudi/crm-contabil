// Acima disto, a sessão é suspeita: cronômetro esquecido rodando a noite inteira é o
// defeito clássico do recurso, e 14h fantasma destroem a margem de um cliente sem
// ninguém entender por quê.
export const LIMITE_SESSAO_MIN = 8 * 60;

export function duracaoSessao(inicioIso: string, agoraIso: string): { minutos: number; suspeita: boolean } {
  const minutos = Math.max(0, Math.round((Date.parse(agoraIso) - Date.parse(inicioIso)) / 60000));
  return { minutos, suspeita: minutos > LIMITE_SESSAO_MIN };
}

export function formatarHoras(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

// Aceita os formatos que a pessoa realmente digita: "1h30", "1:30", "90".
export function parseDuracao(txt: string): number | null {
  const s = String(txt ?? "").trim().toLowerCase();
  if (!s) return null;

  const hm = /^(\d+)\s*[h:]\s*(\d{1,2})?$/.exec(s);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2] ?? 0);
    if (m > 59) return null;
    return h * 60 + m;
  }
  if (/^\d+$/.test(s)) return Number(s);
  return null;
}
