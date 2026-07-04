type Variante = "claro" | "escuro" | "mono" | "simbolo";

// Símbolo: moeda (círculo) com seta pra cima (triângulo + haste). Geométrico, legível em 16px.
function Simbolo({ tamanho, fundo, marca }: { tamanho: number; fundo: string; marca: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      {fundo !== "none" && <circle cx="50" cy="50" r="50" fill={fundo} />}
      {fundo === "none" && <circle cx="50" cy="50" r="47" fill="none" stroke={marca} strokeWidth="6" />}
      <polygon points="50,26 32,50 68,50" fill={marca} />
      <rect x="44" y="48" width="12" height="26" rx="3" fill={marca} />
    </svg>
  );
}

export function LogoSaldo({
  variante = "claro",
  tamanho = 32,
  className,
}: {
  variante?: Variante;
  tamanho?: number;
  className?: string;
}) {
  // fundo do círculo × cor da seta × cor do wordmark
  const cfg = {
    claro: { fundo: "#0FA968", marca: "#ffffff", texto: "#101614" },
    escuro: { fundo: "#0FA968", marca: "#ffffff", texto: "#F1F3F0" },
    mono: { fundo: "none", marca: "#ffffff", texto: "#ffffff" },
    simbolo: { fundo: "#0FA968", marca: "#ffffff", texto: "" },
  }[variante];

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Simbolo tamanho={tamanho} fundo={cfg.fundo} marca={cfg.marca} />
      {variante !== "simbolo" && (
        <span
          className="font-display font-bold tracking-tight"
          style={{ fontSize: Math.round(tamanho * 0.72), color: cfg.texto }}
        >
          Saldo
        </span>
      )}
    </span>
  );
}
