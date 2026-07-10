// Isolado do módulo puro: usa o relógio. Fora de componente, portanto não dispara
// a regra react-hooks/purity (que barra Date.now()/new Date() no render).
export function hojeEmSaoPaulo(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}
