# Timesheet (RF-043) e Rentabilidade por cliente (RF-044) — Design

**Data:** 2026-07-14
**Requisitos:**
- RF-043 — "Timesheet simplificado (apontamento por tarefa/cliente) para apuração de custo de atendimento."
- RF-044 — "Relatório de rentabilidade por cliente: honorários recebidos versus custo estimado de
  atendimento."

**A pergunta que isto responde:** *quanto custa atender este cliente — e ele paga por isso?* É o que
sustenta decisão de preço e de encerrar contrato ruim.

---

## 1. Privacidade: o custo/hora é dado salarial

**Não vai numa coluna de `usuarios`.** A RLS do Postgres é por **linha**, não por coluna: qualquer membro
da equipe que leia `usuarios` (para montar um select de responsáveis, por exemplo) receberia o custo junto.

Vai em tabela própria, **admin-only**, com **vigência**:

```sql
colaborador_custo (id, usuario_id, custo_hora numeric, vigencia_inicio date, vigencia_fim date null)
```

A vigência existe porque o custo muda (aumento, promoção) e **o relatório de março não pode usar o salário
de hoje** — senão a rentabilidade histórica se reescreve sozinha a cada reajuste.

**Quem vê o quê (decisão do usuário):**
- **custo/hora:** só **admin**;
- **apontamentos:** cada colaborador vê e edita **os seus**; **admin e financeiro** veem os de todos;
- **relatório de rentabilidade:** admin e financeiro — mostra custo **agregado por cliente**, nunca "quanto
  custa a hora do Fulano". O financeiro decide preço sem enxergar salário individual.

## 2. Apontamento (RF-043)

**Duas formas (decisão do usuário): manual e cronômetro.**

```sql
apontamento (id, usuario_id, cliente_id null, tarefa_id null, data date, minutos int,
             descricao text, origem enum('manual','cronometro'), criado_em)
apontamento_sessao (usuario_id pk, tarefa_id null, cliente_id null, iniciado_em timestamptz)
```

- **Manual:** data + duração (minutos) + cliente e/ou tarefa + o que foi feito. É como o trabalho de fato é
  registrado: em blocos, no fim do dia.
- **Cronômetro:** botão iniciar/parar na tarefa e no painel. **Uma sessão por pessoa** (a PK é o
  `usuario_id`) — dois cronômetros simultâneos gerariam horas duplicadas.
  - **Trava contra o cronômetro esquecido:** ao parar, se a sessão passou de **8 horas**, o sistema **não
    grava em silêncio**: abre o valor para o operador confirmar ou corrigir. Cronômetro esquecido rodando a
    noite inteira é o defeito clássico desse recurso, e 14h fantasma no relatório destroem a rentabilidade
    do cliente sem ninguém entender por quê.
  - Ao parar, vira um `apontamento` normal (`origem = 'cronometro'`) — o relatório não distingue.
- **Tarefa herda cliente:** apontar numa tarefa que tem cliente preenche o `cliente_id` automaticamente.
  Apontamento **sem cliente** é hora interna (não entra no custo de nenhum cliente, mas entra no total).

## 3. Rentabilidade (RF-044)

Por cliente, num **período** (mês, trimestre, ano ou intervalo livre):

| Coluna | De onde vem |
|---|---|
| **Horas** | Σ `minutos` dos apontamentos do cliente no período ÷ 60 |
| **Custo estimado** | Σ (minutos × custo_hora **vigente na data do apontamento** ÷ 60) |
| **Recebido** | Σ das **baixas não estornadas** dos títulos do cliente no período |
| **Contratado** | honorário mensal × meses do período |
| **Margem (R$)** | Recebido − Custo |
| **Margem (%)** | Margem ÷ Recebido |
| **R$/hora** | Recebido ÷ Horas |

**Recebido E contratado lado a lado (decisão do usuário):** o contratado sozinho esconde o inadimplente —
ele parece rentável mesmo sem pagar. O recebido sozinho pune injustamente quem só atrasou. Ver os dois
mostra a diferença, que é o próprio sinal de inadimplência.

**Custo/hora vigente na data do apontamento**, não o de hoje. É o que impede o relatório do passado de mudar
quando alguém recebe aumento.

**Cliente sem apontamento** aparece com horas 0 e custo 0 — e o relatório **avisa** que não há apontamento
no período. Custo zero não significa "cliente barato"; significa "ninguém apontou". Silenciar isso levaria
alguém a concluir que um cliente é lucrativo quando na verdade não há dado.

**Ordenação padrão:** por margem crescente — os problemas primeiro. O relatório existe para achar cliente
ruim, não para admirar o bom.

## 4. Banco — `0094_timesheet.sql`

- `colaborador_custo` — RLS: **só admin** (select, insert, update).
- `apontamento` — RLS: select/insert/update/delete do **próprio** (`usuario_id = auth.uid()`); **admin e
  financeiro** veem e editam todos.
- `apontamento_sessao` — RLS: só o próprio.
- Índices: `apontamento(cliente_id, data)`, `apontamento(usuario_id, data)`.

O relatório roda **server-side com `service_role`** (precisa cruzar custo, que é admin-only, com títulos e
baixas) e é **gated na action** para admin/financeiro — o mesmo padrão dos demais relatórios financeiros.

## 5. Telas

- **`/timesheet`** (menu, toda a equipe): "Apontar hora" (data, duração, cliente, tarefa, descrição), o
  **cronômetro** (iniciar/parar), a lista dos **meus apontamentos** da semana com total, e — para admin e
  financeiro — o filtro por colaborador.
- **Na ficha da tarefa** (`/tarefas/[id]`): botão de cronômetro e o total de horas já apontado naquela
  tarefa.
- **`/financeiro/rentabilidade`** (admin/financeiro): a tabela do §3, com filtro de período e ordenação;
  totais no rodapé; aviso dos clientes sem apontamento.
- **Configurações → Custo por colaborador** (admin): custo/hora por pessoa, com vigência.
- **Ficha do cliente:** um resumo pequeno — horas e margem do mês corrente (só para quem vê financeiro).

## 6. Testes

Unitários (a regra é o que erra):
- `custoDoApontamento()`: escolhe a vigência **pela data do apontamento**, não pela de hoje; sem vigência
  cadastrada → custo 0 **e sinaliza** (não silencia);
- `rentabilidade()`: margem e percentual; **divisão por zero** (recebido 0 → margem % nula, não `Infinity`);
  cliente sem apontamento → horas 0 + flag `semApontamento`;
- `mesesNoPeriodo()` para o contratado (o período pode não ser um mês cheio);
- `duracaoSessao()`: minutos a partir do início; acima de 8h → `suspeita = true`.

RLS: contador **não vê** `colaborador_custo` nem o apontamento de outro; financeiro **vê** todos os
apontamentos mas **não vê** `colaborador_custo`; cliente do portal não vê nada.

## 7. Entrega

Migration → lint/typecheck/test/build → deploy. Validar: cadastrar custo/hora, apontar hora manual e por
cronômetro, e conferir o relatório com o cliente que você conhece (as contas têm de bater com a mão).

**Versão:** `v5.28.0` (feature).
