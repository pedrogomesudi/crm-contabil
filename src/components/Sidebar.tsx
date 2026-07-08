"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Papel } from "@/lib/tipos";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { podeAtender, podeCriarCliente } from "@/lib/clientes/permissoes";
import { sair } from "@/app/login/actions";
import { LogoSaldo } from "@/components/marca/LogoSaldo";

export function Sidebar({ papel, nome }: { papel: Papel; nome: string }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const itens = [
    { href: "/", label: "Início" },
    { href: "/clientes", label: "Clientes" },
    ...(podeCriarCliente(papel) ? [{ href: "/onboarding", label: "Onboarding" }] : []),
    ...(podeAtender(papel) ? [{ href: "/atendimento", label: "Atendimento" }] : []),
    ...(podeGerenciarFinanceiro(papel) ? [{ href: "/financeiro/cadastros", label: "Financeiro" }] : []),
    ...(["admin", "assistente"].includes(papel) ? [{ href: "/integracoes/dominio", label: "Integração Domínio" }] : []),
    ...(papel === "admin" ? [{ href: "/usuarios", label: "Usuários" }] : []),
    ...(papel === "admin" ? [{ href: "/configuracoes", label: "Configurações" }] : []),
  ];
  const ehAtivo = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label="Navegação principal" className="flex flex-col gap-1 text-sm">
      {itens.map((it) => {
        const ativo = ehAtivo(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={ativo ? "page" : undefined}
            onClick={() => setAberto(false)}
            className={`rounded-lg px-3 py-2 ${ativo ? "bg-verde font-medium text-white" : "text-texto-claro hover:bg-tinta-2"}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Topo mobile */}
      <div className="flex items-center justify-between bg-tinta px-4 py-3 md:hidden">
        <LogoSaldo variante="escuro" tamanho={26} />
        <button
          type="button"
          aria-label="Abrir menu"
          aria-expanded={aberto}
          onClick={() => setAberto((v) => !v)}
          className="rounded-lg p-2 text-texto-claro hover:bg-tinta-2"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Drawer mobile */}
      {aberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setAberto(false)}
          />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col gap-4 bg-tinta p-4">
            <LogoSaldo variante="escuro" tamanho={28} />
            <p className="truncate font-mono text-xs text-mono-muted">{nome}</p>
            {nav}
            <form action={sair} className="mt-auto">
              <button type="submit" className="rounded-lg px-3 py-2 text-sm text-texto-claro hover:bg-tinta-2">
                Sair
              </button>
            </form>
          </aside>
        </div>
      )}

      {/* Sidebar desktop */}
      <aside className="hidden flex-col gap-4 bg-tinta p-4 md:flex md:h-screen md:w-56 md:shrink-0">
        <LogoSaldo variante="escuro" tamanho={28} />
        <p className="truncate font-mono text-xs text-mono-muted">{nome}</p>
        {nav}
        <form action={sair} className="mt-auto">
          <button type="submit" className="rounded-lg px-3 py-2 text-sm text-texto-claro hover:bg-tinta-2 hover:text-white">
            Sair
          </button>
        </form>
      </aside>
    </>
  );
}
