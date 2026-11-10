type Variante = "neutro" | "positivo" | "atencao" | "acao" | "negativo" | "ia";

const ESTILO: Record<Variante, string> = {
  neutro: "bg-creme text-cinza",
  positivo: "bg-verde/10 text-verde",
  atencao: "bg-atencao-fundo text-atencao",
  // Mesma família do `atencao`, peso maior: pendência que depende de NÓS, não de quem está
  // do outro lado. Preenchido em vez de tingido, para saltar numa lista cheia de pendências
  // claras. Texto escuro, e não branco — sobre o #b87d03 o branco dá 3,5:1 e reprova no AA;
  // o `texto` dá 5,2:1.
  acao: "bg-atencao-solido text-texto",
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
