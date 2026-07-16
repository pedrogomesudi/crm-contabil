"use client";

export function ImprimirBtn() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg bg-verde px-3 py-1.5 text-sm font-medium text-white print:hidden"
    >
      Imprimir
    </button>
  );
}
