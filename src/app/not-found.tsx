import Link from "next/link";

export const metadata = { title: "Página não encontrada" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Página não encontrada</h1>
      <p className="text-sm text-slate-600">
        O endereço acessado não existe ou ainda não foi implementado.
      </p>
      <Link href="/" className="text-sm text-slate-900 underline">
        Voltar ao início
      </Link>
    </main>
  );
}
