export function mesesAte(
  anoIni: number,
  mesIni: number,
  anoFim: number,
  mesFim: number,
  max = 24,
): { ano: number; mes: number }[] {
  let a = anoIni;
  let m = mesIni;
  if (a * 12 + m > anoFim * 12 + mesFim) {
    a = anoFim;
    m = mesFim;
  }
  const out: { ano: number; mes: number }[] = [];
  while (a * 12 + m <= anoFim * 12 + mesFim) {
    out.push({ ano: a, mes: m });
    m += 1;
    if (m > 12) {
      m = 1;
      a += 1;
    }
  }
  return out.length > max ? out.slice(out.length - max) : out;
}
