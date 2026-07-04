import { Card } from "./Card";
import { corValorStat, type VarianteStat } from "@/lib/ui/stat";

export function StatCard({
  rotulo,
  valor,
  variante = "neutro",
}: {
  rotulo: string;
  valor: string | number;
  variante?: VarianteStat;
}) {
  return (
    <Card className="p-4">
      <div className="font-mono text-xs text-cinza-claro">{rotulo}</div>
      <div className={`mt-1.5 font-display text-2xl font-semibold ${corValorStat(variante)}`}>{valor}</div>
    </Card>
  );
}
