// O hub de Configurações agrupado por TEMA. Antes eram 27 cartões numa lista plana de duas
// colunas, na ordem em que foram sendo criados: achar "Boletos" ou "SLA" era varredura visual.
// A taxonomia mora aqui, fora do componente, porque é o que se testa (nada de item órfão,
// nada de href repetido) e o que se edita quando entra uma tela nova.

export type ItemConfig = {
  href: string;
  label: string;
  desc: string;
  // Sem a chave, o item é só de admin. O assistente entra no hub apenas pela Integração
  // Domínio — que saiu do menu lateral e passou a viver aqui.
  papeis?: string[];
};

export type GrupoConfig = {
  id: string;
  titulo: string;
  // Uma linha dizendo o que reúne o grupo — é o que dispensa ler os quatro cartões.
  resumo: string;
  itens: ItemConfig[];
};

export const GRUPOS_CONFIG: GrupoConfig[] = [
  {
    id: "escritorio",
    titulo: "Escritório e equipe",
    resumo: "Quem opera o sistema e como o escritório se apresenta.",
    itens: [
      { href: "/usuarios", label: "Usuários", desc: "Convite, papel, departamento, superior e status da equipe." },
      {
        href: "/configuracoes/marca",
        label: "Marca do escritório",
        desc: "Nome, CNPJ, endereço e logo usados na proposta.",
      },
      {
        href: "/configuracoes/custos",
        label: "Custo por colaborador",
        desc: "Custo/hora com vigência — base da rentabilidade.",
      },
    ],
  },
  {
    id: "clientes",
    titulo: "Clientes e cadastro",
    resumo: "O que a ficha do cliente guarda e como ela se mantém em dia.",
    itens: [
      {
        href: "/configuracoes/campos-custom",
        label: "Campos do cadastro",
        desc: "Campos extras do cliente — texto, número, data, sim/não e lista.",
      },
      {
        href: "/configuracoes/tipos-documento",
        label: "Tipos de documento",
        desc: "Catálogo do GED — tipos e departamento, para classificar os arquivos do cliente.",
      },
      {
        href: "/configuracoes/receita",
        label: "Monitoramento da Receita",
        desc: "Reconsulta automática de situação cadastral e Simples: frequência e badge.",
      },
    ],
  },
  {
    id: "comercial",
    titulo: "Comercial",
    resumo: "Do funil à proposta: etapas, preço e o que acontece depois do envio.",
    itens: [
      {
        href: "/configuracoes/funil",
        label: "Funil comercial",
        desc: "Etapas do pipeline — rótulo, cor, probabilidade e ordem.",
      },
      {
        href: "/configuracoes/precificacao",
        label: "Precificação de honorários",
        desc: "Base por regime, acréscimos, complexidade, serviços, piso e desconto.",
      },
      {
        href: "/configuracoes/followup",
        label: "Follow-up de propostas",
        desc: "Sequência automática (e-mail ou WhatsApp) após o envio da proposta.",
      },
    ],
  },
  {
    id: "financeiro",
    titulo: "Financeiro e fiscal",
    resumo: "Emissão, cobrança e o calendário que o escritório precisa cumprir.",
    itens: [
      { href: "/configuracoes/nfse", label: "NFS-e (emitente)", desc: "Dados do emitente e certificado digital." },
      {
        href: "/configuracoes/pagamento",
        label: "Dados de pagamento (PIX/TED)",
        desc: "Conta e PIX enviados ao cliente com a NFS-e.",
      },
      { href: "/configuracoes/boletos", label: "Boletos", desc: "Provedor de emissão (Inter ou Asaas) e credenciais." },
      {
        href: "/configuracoes/obrigacoes",
        label: "Matriz de obrigações",
        desc: "Obrigações e critérios de incidência do calendário.",
      },
    ],
  },
  {
    id: "comunicacao",
    titulo: "Comunicação",
    resumo: "Os canais que falam com o cliente e as mensagens que eles enviam.",
    itens: [
      {
        href: "/configuracoes/whatsapp",
        label: "WhatsApp",
        desc: "Provedor (Z-API ou API oficial), credenciais e templates por fluxo.",
      },
      { href: "/configuracoes/email", label: "E-mail", desc: "Canal de envio (SMTP ou API), remetente e teste." },
      {
        href: "/configuracoes/email/templates",
        label: "Templates de e-mail",
        desc: "Modelos com variáveis de personalização.",
      },
      {
        href: "/configuracoes/nps",
        label: "Pesquisa de satisfação (NPS)",
        desc: "Coleta no portal: liga/desliga, periodicidade e texto da pergunta.",
      },
    ],
  },
  {
    id: "processos",
    titulo: "Processos e prazos",
    resumo: "Roteiros que viram tarefas e o prazo que mede cada um.",
    itens: [
      {
        href: "/configuracoes/onboarding",
        label: "Template de onboarding",
        desc: "Blocos e itens do processo de entrada do cliente.",
      },
      {
        href: "/configuracoes/sop",
        label: "Modelos de processo (SOPs)",
        desc: "Etapas que viram tarefas, em ondas paralelas e sequenciais.",
      },
      {
        href: "/configuracoes/legalizacao",
        label: "Modelos de legalização",
        desc: "Processos societários e de legalização (etapas por órgão).",
      },
      {
        href: "/configuracoes/sla",
        label: "SLA por departamento",
        desc: "Prazo-alvo das solicitações internas, por departamento de destino.",
      },
    ],
  },
  {
    id: "integracoes",
    titulo: "Integrações",
    resumo: "Como outros sistemas conversam com o SALDO.",
    itens: [
      {
        href: "/integracoes/dominio",
        label: "Integração Domínio",
        desc: "Importação e conciliação com o sistema Domínio.",
        papeis: ["admin", "assistente"],
      },
      {
        href: "/configuracoes/api",
        label: "API pública",
        desc: "Chaves de acesso e escopos para integrações externas via /api/v1.",
      },
      {
        href: "/configuracoes/webhooks",
        label: "Webhooks de saída",
        desc: "URLs que recebem eventos do CRM (título pago, obrigação entregue etc.).",
      },
    ],
  },
  {
    id: "seguranca",
    titulo: "Segurança e conformidade",
    resumo: "Acesso, rastro de falhas e obrigações com dados pessoais.",
    itens: [
      {
        href: "/configuracoes/seguranca",
        label: "Segurança (2FA)",
        desc: "Exigir verificação em duas etapas de toda a equipe.",
      },
      { href: "/lgpd", label: "LGPD", desc: "Tratamentos (ROPA), consentimento, retenção e direitos do titular." },
      {
        href: "/configuracoes/observabilidade",
        label: "Observabilidade",
        desc: "Erros do sistema registrados, para diagnóstico.",
      },
    ],
  },
];

// Filtro de NAVEGAÇÃO, não de segurança: cada tela de destino mantém o próprio gate.
// Grupo que fica sem item para o papel não é renderizado — cabeçalho vazio é ruído.
export function gruposDoPapel(papel: string): GrupoConfig[] {
  return GRUPOS_CONFIG.map((g) => ({
    ...g,
    itens: g.itens.filter((i) => (i.papeis ?? ["admin"]).includes(papel)),
  })).filter((g) => g.itens.length > 0);
}
