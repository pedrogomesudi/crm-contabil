import Link from "next/link";
import { LogoSaldo } from "@/components/marca/LogoSaldo";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-creme p-8 text-center">
      <LogoSaldo variante="claro" tamanho={34} />
      <h1 className="font-display text-2xl font-bold tracking-tight text-texto">Página não encontrada</h1>
      <p className="text-sm text-cinza">O endereço acessado não existe ou foi removido.</p>
      <Link href="/" className="text-sm font-medium text-verde hover:underline">
        Voltar ao início
      </Link>
    </main>
  );
}
