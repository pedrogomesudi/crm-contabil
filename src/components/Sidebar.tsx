"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Papel } from "@/lib/tipos";
import { sair } from "@/app/login/actions";

export function Sidebar({ papel, nome }: { papel: Papel; nome: string }) {
  const pathname = usePathname();
  const itens = [
    { href: "/", label: "Início" },
    { href: "/clientes", label: "Clientes" },
    ...(["admin", "assistente"].includes(papel)
      ? [{ href: "/integracoes/dominio", label: "Integração Domínio" }]
      : []),
    ...(papel === "admin" ? [{ href: "/usuarios", label: "Usuários" }] : []),
  ];
  // "/" casa exato; os demais casam por prefixo (ex.: /clientes/123).
  const ehAtivo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="flex flex-col gap-3 bg-slate-900 p-4 text-slate-100 md:h-screen md:w-56 md:shrink-0">
      <div>
        <p className="text-lg font-semibold">CRM Contábil</p>
        <p className="truncate text-xs text-slate-300">{nome}</p>
      </div>
      <nav
        aria-label="Navegação principal"
        className="flex flex-wrap gap-1 text-sm md:flex-col md:space-y-1"
      >
        {itens.map((it) => {
          const ativo = ehAtivo(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={ativo ? "page" : undefined}
              className={`rounded px-3 py-2 hover:bg-slate-800 ${
                ativo ? "bg-slate-800 font-medium" : ""
              }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
      <form action={sair} className="md:mt-auto">
        <button
          type="submit"
          className="rounded px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          Sair
        </button>
      </form>
    </aside>
  );
}
