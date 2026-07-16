import Link from "next/link";

// Link "voltar" padronizado (estilo do Botão secundário) para as telas internas.
export function Voltar({ href, label = "Voltar" }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 rounded-lg border border-linha bg-white px-3 py-1.5 text-sm font-medium text-texto transition hover:bg-creme print:hidden"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      {label}
    </Link>
  );
}
