type Variante = "neutro" | "positivo" | "atencao" | "negativo" | "ia";

const ESTILO: Record<Variante, string> = {
  neutro: "bg-creme text-cinza",
  positivo: "bg-verde/10 text-verde",
  atencao: "bg-amber-100 text-amber-800",
  negativo: "bg-negativo/10 text-negativo",
  ia: "bg-violeta/10 text-violeta",
};

export function Badge({ children, variante = "neutro" }: { children: React.ReactNode; variante?: Variante }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTILO[variante]}`}>
      {children}
    </span>
  );
}
