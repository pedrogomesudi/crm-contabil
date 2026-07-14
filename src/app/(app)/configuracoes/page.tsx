import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";

const ITENS = [
  { href: "/configuracoes/marca", label: "Marca do escritório", desc: "Nome, CNPJ, endereço e logo usados na proposta." },
  { href: "/configuracoes/whatsapp", label: "WhatsApp (Z-API)", desc: "Credenciais do provedor e teste de conexão." },
  { href: "/configuracoes/email", label: "E-mail", desc: "Canal de envio (SMTP ou API), remetente e teste." },
  { href: "/configuracoes/email/templates", label: "Templates de e-mail", desc: "Modelos com variáveis de personalização." },
  { href: "/configuracoes/nfse", label: "NFS-e (emitente)", desc: "Dados do emitente e certificado digital." },
  { href: "/configuracoes/pagamento", label: "Dados de pagamento (PIX/TED)", desc: "Conta e PIX enviados ao cliente com a NFS-e." },
  { href: "/configuracoes/boletos", label: "Boletos", desc: "Provedor de emissão (Inter ou Asaas) e credenciais." },
  { href: "/configuracoes/onboarding", label: "Template de onboarding", desc: "Blocos e itens do processo de entrada." },
  { href: "/configuracoes/sop", label: "Modelos de processo (SOPs)", desc: "Etapas que viram tarefas, em ondas paralelas e sequenciais." },
  { href: "/configuracoes/legalizacao", label: "Modelos de legalização", desc: "Processos societários e de legalização (etapas por órgão)." },
  { href: "/configuracoes/obrigacoes", label: "Matriz de obrigações", desc: "Obrigações e critérios de incidência do calendário." },
];

export default async function ConfiguracoesHubPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || perfil.papel !== "admin") redirect("/");
  return (
    <main className="mx-auto max-w-3xl space-y-5 p-4">
      <PageHeader titulo="Configurações" subtitulo="Integrações e credenciais do sistema" />
      <ul className="grid gap-3 sm:grid-cols-2">
        {ITENS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex items-start justify-between gap-3 rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm"
            >
              <span>
                <span className="block font-medium text-texto">{i.label}</span>
                <span className="mt-0.5 block text-xs text-cinza">{i.desc}</span>
              </span>
              <svg className="mt-1 shrink-0 text-cinza-claro" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
