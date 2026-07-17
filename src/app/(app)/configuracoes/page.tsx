import Link from "next/link";
import { redirect } from "next/navigation";
import { getPerfilAtual } from "@/lib/auth/perfil";
import { PageHeader } from "@/components/ui/PageHeader";

// `papeis` restringe o item. Sem a chave, o item é só de admin.
// O assistente entra aqui apenas pela Integração Domínio — que saiu do menu lateral e
// passou a viver nesta seção; sem isso ele perderia o acesso.
const ITENS: { href: string; label: string; desc: string; papeis?: string[] }[] = [
  { href: "/usuarios", label: "Usuários", desc: "Convite, papel, departamento, superior e status da equipe." },
  {
    href: "/integracoes/dominio",
    label: "Integração Domínio",
    desc: "Importação e conciliação com o sistema Domínio.",
    papeis: ["admin", "assistente"],
  },
  {
    href: "/configuracoes/marca",
    label: "Marca do escritório",
    desc: "Nome, CNPJ, endereço e logo usados na proposta.",
  },
  { href: "/configuracoes/whatsapp", label: "WhatsApp (Z-API)", desc: "Credenciais do provedor e teste de conexão." },
  { href: "/configuracoes/email", label: "E-mail", desc: "Canal de envio (SMTP ou API), remetente e teste." },
  {
    href: "/configuracoes/email/templates",
    label: "Templates de e-mail",
    desc: "Modelos com variáveis de personalização.",
  },
  { href: "/configuracoes/nfse", label: "NFS-e (emitente)", desc: "Dados do emitente e certificado digital." },
  {
    href: "/configuracoes/pagamento",
    label: "Dados de pagamento (PIX/TED)",
    desc: "Conta e PIX enviados ao cliente com a NFS-e.",
  },
  { href: "/configuracoes/boletos", label: "Boletos", desc: "Provedor de emissão (Inter ou Asaas) e credenciais." },
  {
    href: "/configuracoes/onboarding",
    label: "Template de onboarding",
    desc: "Blocos e itens do processo de entrada.",
  },
  {
    href: "/configuracoes/sop",
    label: "Modelos de processo (SOPs)",
    desc: "Etapas que viram tarefas, em ondas paralelas e sequenciais.",
  },
  {
    href: "/configuracoes/custos",
    label: "Custo por colaborador",
    desc: "Custo/hora com vigência — base da rentabilidade. Só admin.",
  },
  {
    href: "/configuracoes/sla",
    label: "SLA por departamento",
    desc: "Prazo-alvo das solicitações internas, por departamento de destino.",
  },
  { href: "/lgpd", label: "LGPD", desc: "Tratamentos (ROPA), consentimento, retenção e direitos do titular." },
  {
    href: "/configuracoes/legalizacao",
    label: "Modelos de legalização",
    desc: "Processos societários e de legalização (etapas por órgão).",
  },
  {
    href: "/configuracoes/obrigacoes",
    label: "Matriz de obrigações",
    desc: "Obrigações e critérios de incidência do calendário.",
  },
];

export default async function ConfiguracoesHubPage() {
  const perfil = await getPerfilAtual();
  if (!perfil || !["admin", "assistente"].includes(perfil.papel)) redirect("/");
  // Cada página de destino mantém o próprio gate: o filtro aqui é de navegação, não de segurança.
  const itens = ITENS.filter((i) => (i.papeis ?? ["admin"]).includes(perfil.papel));
  return (
    <main className="mx-auto max-w-[720px] space-y-5 p-4">
      <PageHeader titulo="Configurações" subtitulo="Integrações e credenciais do sistema" />
      {/* auto-rows-fr + h-full: todos os cards com a mesma altura, mesmo quando a descrição
          ocupa mais linhas em um deles. Sem isso o grid vira uma escada. */}
      <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2">
        {itens.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="flex h-full items-start justify-between gap-3 rounded-2xl border border-linha bg-white p-4 transition hover:border-cinza-claro hover:shadow-sm"
            >
              <span>
                <span className="block font-medium text-texto">{i.label}</span>
                <span className="mt-0.5 block text-xs text-cinza">{i.desc}</span>
              </span>
              <svg
                className="mt-1 shrink-0 text-cinza-claro"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
