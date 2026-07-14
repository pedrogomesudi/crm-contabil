"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Papel } from "@/lib/tipos";
import { podeGerenciarFinanceiro } from "@/lib/financeiro/permissoes";
import { podeAtender, podeAtenderSolicitacoes, podeCriarCliente, podeGerenciarVencimentos } from "@/lib/clientes/permissoes";
import { sair } from "@/app/login/actions";
import { LogoSaldo } from "@/components/marca/LogoSaldo";

export function Sidebar({ papel, nome, alertasOnboarding = 0, riscosObrigacoes = 0, escalonamento = 0, vencimentos = 0 }: { papel: Papel; nome: string; alertasOnboarding?: number; riscosObrigacoes?: number; escalonamento?: number; vencimentos?: number }) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const itens: { href: string; label: string; badge?: number }[] = [
    { href: "/", label: "Início" },
    { href: "/clientes", label: "Clientes" },
    ...(podeCriarCliente(papel) ? [{ href: "/onboarding", label: "Onboarding", badge: alertasOnboarding }] : []),
    ...(podeCriarCliente(papel) ? [{ href: "/legalizacao", label: "Legalização" }] : []),
    ...(podeCriarCliente(papel) ? [{ href: "/comercial", label: "Comercial" }] : []),
    ...(podeCriarCliente(papel) ? [{ href: "/comercial/propostas", label: "Propostas" }] : []),
    ...(podeCriarCliente(papel) ? [{ href: "/obrigacoes", label: "Obrigações", badge: riscosObrigacoes || undefined }] : []),
    { href: "/tarefas", label: "Tarefas" },
    ...(podeAtenderSolicitacoes(papel) ? [{ href: "/solicitacoes", label: "Solicitações" }] : []),
    { href: "/comunicados", label: "Comunicados" },
    ...(podeCriarCliente(papel) ? [{ href: "/obrigacoes/escalonamento", label: "Escalonamento", badge: escalonamento || undefined }] : []),
    ...(podeGerenciarVencimentos(papel) ? [{ href: "/vencimentos", label: "Vencimentos", badge: vencimentos || undefined }] : []),
    ...(podeAtender(papel) ? [{ href: "/atendimento", label: "Atendimento" }] : []),
    ...(podeGerenciarFinanceiro(papel) ? [{ href: "/financeiro/cadastros", label: "Financeiro" }] : []),
    ...(podeGerenciarFinanceiro(papel) ? [{ href: "/financeiro/conciliacao", label: "Conciliação" }] : []),
    ...(["admin", "assistente"].includes(papel) ? [{ href: "/integracoes/dominio", label: "Integração Domínio" }] : []),
    ...(papel === "admin" ? [{ href: "/usuarios", label: "Usuários" }] : []),
    ...(papel === "admin" ? [{ href: "/configuracoes", label: "Configurações" }] : []),
  ];
  // Realça só o item mais específico (o href mais longo que casa com a rota atual),
  // evitando destacar "Comercial" e "Propostas" ao mesmo tempo.
  const hrefAtivo = itens
    .map((it) => it.href)
    .filter((h) => (h === "/" ? pathname === "/" : pathname === h || pathname.startsWith(`${h}/`)))
    .sort((a, b) => b.length - a.length)[0];
  const ehAtivo = (href: string) => href === hrefAtivo;

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
            <span className="flex items-center justify-between gap-2">
              {it.label}
              {it.badge ? <span className="rounded-full bg-negativo px-1.5 text-[10px] font-semibold text-white">{it.badge}</span> : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Topo mobile */}
      <div className="flex items-center justify-between bg-tinta px-4 py-3 md:hidden print:hidden">
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
      <aside className="hidden flex-col gap-4 bg-tinta p-4 md:flex md:h-screen md:w-56 md:shrink-0 print:!hidden">
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
