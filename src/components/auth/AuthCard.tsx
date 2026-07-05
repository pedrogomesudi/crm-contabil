import { LogoSaldo } from "@/components/marca/LogoSaldo";

export function AuthCard({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-creme p-4">
      <div className="w-full max-w-sm rounded-2xl border border-linha bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <LogoSaldo variante="claro" tamanho={34} />
          <h1 className="font-display text-lg font-semibold tracking-tight text-texto">{titulo}</h1>
        </div>
        {children}
        <p className="mt-6 text-center font-mono text-[11px] tracking-wide text-cinza-claro">SEMPRE NO SALDO</p>
      </div>
    </main>
  );
}
