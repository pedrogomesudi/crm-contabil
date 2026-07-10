# Certificados digitais e procurações, com alertas de vencimento — Design

> **Status:** design aprovado · **Data:** 2026-07-09
> **Requisitos:** RF-022 (certificados) e RF-023 (procurações) do *SALDO — Requisitos e Gap Analysis v1.3*.
> Ambos estavam como **Parcial**, com a nota: *"armazenamento existe; faltam alertas escalonados de vencimento."*

## 1. Contexto e objetivo

Escritórios contábeis controlam certificados digitais e procurações em planilhas. Um certificado
vencido paralisa a emissão de NFS-e e o acesso ao e-CAC; uma procuração vencida derruba o acesso do
escritório aos portais do cliente. O sistema hoje **não tem** esse controle:

- `onboarding_item.categoria` já aceita `'certificado'` e `'procuracao'`, mas como **tarefas de coleta**
  (pendente/concluído, `prazo` = prazo para obter, anexo). Não guarda validade, tipo, titular, órgão nem
  outorgante.
- `nfse_certificado_cliente` guarda o A1 cifrado **com `validade`** — mas só o certificado usado para
  emitir NFS-e, e sua RLS é admin-only.
- Os motores de alerta existentes não servem: `onboarding/alertas.ts` usa janela de 3 dias;
  `obrigacoes/risco.ts` só classifica *vencida / vencendo hoje / no prazo*. Nenhum tem a escala 60/30/15.

O objetivo é um **controle de vencimentos** por cliente, com alertas escalonados in-app.

## 2. Decisões do brainstorming

- **Visão única de vencimentos:** o controle lê a validade do A1 da NFS-e **sem duplicá-la** — nada de
  duas validades para o mesmo certificado, uma disparando alerta e outra emitindo nota. O fluxo fiscal em
  produção **não é tocado**.
- **Alerta in-app para a equipe** (badge + página), nos marcos **60/30/15 dias** e vencido. Sem canal
  externo (WhatsApp/e-mail) nesta fatia.
- **Só metadados.** O arquivo (PDF da procuração etc.) continua na área de **Documentos** do cliente,
  que já tem upload, URL assinada e auditoria.
- **Duas tabelas** (`certificado_digital`, `procuracao`), não uma tabela genérica com `tipo`: os
  atributos divergem no essencial (tipo/titular/emissão × órgão/outorgante/outorgado) e uma tabela única
  deixaria metade das colunas sempre nula.

## 3. Modelo de dados

Migration idempotente nova: **`supabase/migrations/0069_vencimentos.sql`**.

### 3.1 `certificado_digital`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK → `clientes(id)` on delete cascade | |
| `tipo` | enum `certificado_tipo` (`A1`, `A3`) | |
| `titular` | text not null | nome do titular (PJ ou sócio) |
| `documento_titular` | text | CNPJ/CPF, opcional |
| `emissao` | date | opcional |
| `validade` | date **not null** | dispara o alerta |
| `observacao` | text | |
| `ativo` | boolean not null default true | `false` = renovado/substituído |
| `criado_em/por`, `atualizado_em/por` | | autoria não-forjável por trigger |

### 3.2 `procuracao`

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `cliente_id` | uuid FK → `clientes(id)` on delete cascade | |
| `orgao` | text not null | e-CAC, prefeitura, INSS, Junta… |
| `outorgante` | text not null | quem outorga (cliente/sócio) |
| `outorgado` | text | quem recebe (escritório/contador), opcional |
| `inicio` | date | opcional |
| `validade` | date **not null** | dispara o alerta |
| `observacao` | text | |
| `ativo` | boolean not null default true | |
| `criado_em/por`, `atualizado_em/por` | | |

Índices: `(cliente_id)` e `(validade) where ativo` em ambas.

O enum é criado no padrão idempotente do projeto:
`do $$ begin create type certificado_tipo as enum ('A1','A3'); exception when duplicate_object then null; end $$;`

### 3.3 Leitura da validade do A1 da NFS-e

Função `SECURITY DEFINER` **`certificados_nfse_vencimento()`** que devolve **apenas**
`(cliente_id uuid, validade timestamptz, origem text)`.

- Nunca seleciona `pfx_cifrado` nem `senha_cifrada` — é a superfície mínima para o alerta existir sem
  abrir o cofre.
- Como `SECURITY DEFINER` bypassa a RLS, a função **replica explicitamente a regra de visibilidade**:
  admin/assistente veem todos os clientes; contador só aqueles com `contador_id = auth.uid()`. Qualquer
  outro papel recebe conjunto vazio.
- Inclui também o certificado do escritório (`nfse_certificado`, linha `id = 1`) com `cliente_id = null`
  e `origem = 'nfse_escritorio'`, visível a admin/assistente/contador — o A1 do escritório vencido
  paralisa a emissão dos honorários.
- `grant execute ... to authenticated`.

### 3.4 RLS

`certificado_digital` e `procuracao`: **admin / assistente / contador-dono**, em `select`, `insert`,
`update` e `delete`.

> **Divergência deliberada:** `obrigacao_instancia` usa `exists (select 1 from clientes …)`, o que faz a
> RLS liberar também o **financeiro** (barrado apenas pelo gate da tela). Certificado e procuração não
> são dado financeiro; estas políticas já nascem fechadas para o financeiro, sem depender do gate da UI.

Trigger de autoria não-forjável (`criado_por`/`atualizado_por` a partir de `auth.uid()`), no padrão do
projeto.

## 4. Motor de alerta (puro)

`src/lib/vencimentos/alerta.ts` — determinístico e testável, sem tocar no banco.

```
dias = validade − hoje        (datas ISO; "hoje" em America/Sao_Paulo, calculado no servidor)

dias <  0   → "vencido"
dias <= 15  → "critico"
dias <= 30  → "alerta"
dias <= 60  → "aviso"
senão       → "ok"            (não aparece no painel)
```

Exporta:

- `type Severidade = "vencido" | "critico" | "alerta" | "aviso" | "ok"`
- `classificarVencimento(validade: string, hoje: string): { severidade: Severidade; diasRestantes: number }`
- `ordemSeveridade(s: Severidade): number` — para ordenar do mais grave ao menos grave
- `type ItemVencimento = { id: string; origem: "certificado" | "procuracao" | "nfse"; clienteId: string | null; clienteNome: string; titulo: string; detalhe: string; validade: string; severidade: Severidade; diasRestantes: number; editavel: boolean }`
- `montarPainel(itens: ItemVencimento[]): { resumo: { vencidos: number; criticos: number; alertas: number; avisos: number }; itens: ItemVencimento[] }` — **descarta os `ok`**, ordena por severidade e depois por validade, e conta os quatro cartões.

O certificado do escritório (`cliente_id = null`) entra com `clienteNome = "Escritório"` e aparece
**apenas na página global** — na ficha de um cliente ele não faz sentido.

O "hoje" é calculado no **servidor** e passado como argumento. `Date.now()` dentro de componente é
barrado pela regra `react-hooks/purity` do projeto — foi exatamente o que quebrou o lint na V5-B.

As linhas de `origem = "nfse"` chegam com `editavel: false`: renovar o A1 continua sendo feito na tela
da NFS-e, que é quem de fato o usa.

## 5. Permissões

Nova função em `src/lib/clientes/permissoes.ts` (fonte única, como as demais):

```ts
// Quem vê/gerencia certificados e procurações: quem gerencia o cadastro do cliente.
// O financeiro fica de fora — não é dado financeiro (ver RLS, §3.4).
export function podeGerenciarVencimentos(papel: Papel | undefined): boolean {
  return papel === "admin" || papel === "assistente" || papel === "contador";
}
```

Gate no app **e** na RLS. O contador é isolado aos seus clientes pela RLS.

## 6. UI

### 6.1 Seção na ficha do cliente — "Certificados e procurações"

Abaixo da seção de Obrigações. Duas listas curtas, cada uma com **adicionar / renovar / desativar** e
**selo de severidade**.

- O A1 da NFS-e aparece como **linha somente-leitura**, marcada `origem: NFS-e`, com link para
  Configurações → NFS-e. Deixa explícito que aquele vencimento é o mesmo que a emissão usa.
- **Renovar** (botão próprio): grava o novo registro e desativa o antigo, numa ação só. Um certificado
  renovado *é* outro certificado — preserva o histórico sem tabela de histórico.
- **Desativar**: arquiva o registro (sai do painel, permanece na ficha), com confirmação inline.
- **Não há "editar"** (YAGNI): corrigir um erro de digitação é desativar e cadastrar de novo, o que
  também deixa rastro. Evita uma terceira ação de escrita para um caso raro.

### 6.2 Página global `/vencimentos`

- Quatro cartões de resumo: **vencidos**, **≤ 15 dias**, **≤ 30**, **≤ 60**.
- Tabela ordenada por severidade e validade, com filtros por tipo (certificado/procuração), severidade e
  busca por cliente.
- **Badge no menu** com `vencidos + críticos`, no padrão do badge de riscos das obrigações.
- **Exportação CSV** reusando `src/lib/financeiro/csv.ts` (já protege contra injeção de fórmula).

## 7. Erros e casos de borda

- `validade` obrigatória. Se `emissao` for informada, exige `emissao <= validade` (validado na action).
- **Clientes excluídos (`excluido_em`) e inativos ficam fora do painel** — certificado de cliente que
  saiu não é problema de ninguém. Mesmo tratamento que as obrigações dão à suspensão. Continuam
  visíveis na ficha do cliente.
- Certificado da NFS-e **sem `validade`** não vira linha (nada de linha fantasma).
- Registro com `ativo = false` sai do painel, permanece na ficha como histórico.
- **Várias procurações ativas para o mesmo órgão são permitidas** (sócios diferentes, escopos
  diferentes) — sem índice único.
- Fuso: `hoje` em `America/Sao_Paulo`, no servidor.

## 8. Testes

- **Unit `alerta.ts` — fronteiras** (é onde este tipo de código erra): 61 → `ok`, 60 → `aviso`,
  31 → `aviso`, 30 → `alerta`, 16 → `alerta`, 15 → `critico`, 0 → `critico`, −1 → `vencido`.
- **Unit** — `ordemSeveridade` ordena do mais grave ao menos grave; `montarPainel` conta os quatro
  cartões corretamente.
- **Unit `montar.ts`** — a união das três fontes marca `editavel: false` **somente** nas linhas de
  `origem = "nfse"`. A união é uma função pura (`montarItens`), separada da server action justamente
  para poder ser testada sem mock do banco.
- **Unit** — `podeGerenciarVencimentos`: true para admin/assistente/contador; false para financeiro e
  `undefined`.
- **RLS (`supabase/tests/rls.test.sql`)** — contador vê só os certificados/procurações dos **seus**
  clientes; **financeiro não vê nenhum**; assistente vê todos; e `certificados_nfse_vencimento()` não
  devolve certificado de cliente alheio ao contador.
- **E2E manual** — procuração vencendo em 20 dias sai como `alerta`; em 10 dias vira `critico` e entra na
  contagem do badge.

## 9. Fora de escopo (consciente)

- Notificação por **WhatsApp/e-mail** (o alerta é in-app nesta fatia).
- **Escalonamento hierárquico** (colaborador → líder → sócio), como nas obrigações.
- **Anexo de arquivo** no registro — o documento vive em Documentos do cliente.
- **Renovação automática** ou integração com autoridade certificadora.
- Taxonomia de certificado além de `A1`/`A3` (e-CNPJ vs e-CPF ficam como texto em `titular`).
