import type { PontoSerie } from "@/lib/financeiro/orcado-realizado";

const MESES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function LinhaEvolucao({ serie }: { serie: PontoSerie[] }) {
  const W = 320;
  const H = 170;
  const pad = 28;
  const max = Math.max(1, ...serie.flatMap((p) => [p.orcado, p.realizado]));
  const x = (i: number) => pad + (i * (W - pad - 10)) / 11;
  const y = (v: number) => H - 30 - (v / max) * (H - 60);
  const pts = (key: "orcado" | "realizado") => serie.map((p, i) => `${x(i)},${y(p[key])}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="180" role="img" aria-label="Evolução orçado x realizado">
      <line x1={pad} y1={H - 30} x2={W - 10} y2={H - 30} stroke="#e7e5df" />
      <polyline fill="none" stroke="#d8d4ca" strokeWidth="2.5" points={pts("orcado")} />
      <polyline fill="none" stroke="#0FA968" strokeWidth="2.5" points={pts("realizado")} />
      {serie.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(p.realizado)} r="2.5" fill="#0FA968" />
      ))}
      {MESES.map((m, i) => (
        <text key={i} x={x(i)} y={H - 12} fontSize="9" fill="#6b7280" textAnchor="middle">
          {m}
        </text>
      ))}
    </svg>
  );
}
