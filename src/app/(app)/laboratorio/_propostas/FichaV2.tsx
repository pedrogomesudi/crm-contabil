import { Container } from "@/components/ui/Container";
import { Secao } from "@/components/ui/Secao";
import { Abas } from "@/components/ui/Abas";
import { Badge } from "@/components/ui/Badge";
import { Voltar } from "@/components/ui/Voltar";
import { formatarDocumento } from "@/lib/format";
import { CLIENTE_FICTICIO } from "../_dados";

// As 19 seções que hoje descem numa coluna só (clientes/[id]/page.tsx, ~330 linhas),
// agrupadas por afinidade. O texto dentro de cada aba é marcador: o que se avalia aqui é o
// AGRUPAMENTO e o layout — o conteúdo real de cada bloco já existe e é plugado na promoção.
const ABAS = [
  { chave: "cadastro", rotulo: "Cadastro" },
  { chave: "financeiro", rotulo: "Financeiro" },
  { chave: "fiscal", rotulo: "Fiscal", badge: 3 },
  { chave: "documentos", rotulo: "Documentos" },
  { chave: "relacao", rotulo: "Relação" },
];

export function FichaV2({ aba }: { aba: string }) {
  return (
    <Container>
      <div className="space-y-4">
        {/* A ficha de hoje não tem saída: ela só linka para o onboarding, e quem entra por
            um link de outro módulo fica sem caminho de volta para a lista. */}
        <Voltar href="/clientes" label="Clientes" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold tracking-tight text-texto">
              {CLIENTE_FICTICIO.razao_social}
            </h1>
            <Badge variante="positivo">Ativo</Badge>
          </div>
          <p className="font-mono text-xs text-cinza-claro">{formatarDocumento(CLIENTE_FICTICIO.cpf_cnpj)}</p>
        </div>

        {/* As abas ficam fora do conteúdo condicional de propósito: são a régua de navegação
            da ficha e não podem sumir ao trocar de aba. */}
        <Abas itens={ABAS} ativa={aba} base="/laboratorio" param="aba" />

        {aba === "cadastro" && (
          <Secao titulo="Dados cadastrais" descricao="Identificação, endereço e representante">
            <p className="text-sm text-cinza">
              O formulário em 12 colunas entra aqui — veja a tela <strong>Cadastro de cliente</strong>.
            </p>
          </Secao>
        )}

        {aba === "financeiro" && (
          <div className="space-y-4">
            <Secao titulo="Honorário" descricao="Valor vigente e vencimento">
              <p className="font-display text-2xl font-semibold tabular-nums text-texto">R$ 1.500,00</p>
              <p className="mt-1 text-xs text-cinza">vence todo dia 10</p>
            </Secao>
            <Secao titulo="Vigências e contratos" descricao="Reajustes e contratos assinados">
              <p className="text-sm text-cinza">
                Hoje: honorário, linha do tempo de vigências, contratos e opt-out de cobrança — quatro blocos soltos na
                coluna.
              </p>
            </Secao>
          </div>
        )}

        {aba === "fiscal" && (
          <div className="space-y-4">
            <Secao titulo="Obrigações" descricao="3 no prazo">
              <p className="text-sm text-cinza">Calendário e baixas do cliente.</p>
            </Secao>
            <Secao titulo="Notas fiscais emitidas">
              <p className="text-sm text-cinza">
                Hoje há <strong>duas seções de NFS-e adjacentes</strong> na mesma página (notas + emissão). Aqui elas
                convivem numa aba só.
              </p>
            </Secao>
            <Secao titulo="Vencimentos" descricao="Certificados e procurações">
              <p className="text-sm text-cinza">O que vence nos próximos 60 dias.</p>
            </Secao>
          </div>
        )}

        {aba === "documentos" && (
          <Secao titulo="Arquivos" descricao="Contrato social, procurações e LGPD">
            <p className="text-sm text-cinza">Documentos do cliente e o contrato gerado.</p>
          </Secao>
        )}

        {aba === "relacao" && (
          <Secao titulo="Relacionamento" descricao="E-mails, tarefas, SOPs, responsáveis e portal">
            <p className="text-sm text-cinza">Histórico de contato e acessos do cliente.</p>
          </Secao>
        )}
      </div>
    </Container>
  );
}
