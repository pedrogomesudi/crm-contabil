import Link from "next/link";
import type { Papel } from "@/lib/tipos";
import { sair } from "@/app/login/actions";

export function Sidebar({ papel, nome }: { papel: Papel; nome: string }) {
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-slate-900 p-4 text-slate-100">
      <p className="text-lg font-semibold">CRM Contábil</p>
      <p className="mb-6 truncate text-xs text-slate-400">{nome}</p>
      <nav className="space-y-1 text-sm">
        <Link href="/" className="block rounded px-2 py-1 hover:bg-slate-800">
          Início
        </Link>
        <Link href="/clientes" className="block rounded px-2 py-1 hover:bg-slate-800">
          Clientes
        </Link>
        {papel === "admin" && (
          <Link href="/usuarios" className="block rounded px-2 py-1 hover:bg-slate-800">
            Usuários
          </Link>
        )}
      </nav>
      <form action={sair} className="mt-auto pt-6">
        <button type="submit" className="text-xs text-slate-400 hover:text-slate-100">
          Sair
        </button>
      </form>
    </aside>
  );
}
