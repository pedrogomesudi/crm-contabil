# Tarefas — Fatia B: recorrência, calendário e SOPs — Design

**Data:** 2026-07-14
**Requisitos:** RF-040 (tarefas **recorrentes**), RF-042 (visão de **calendário**), RF-041 (**templates de
processo / SOPs** com etapas sequenciais ou paralelas, responsáveis por papel e prazos relativos).
**Nota do gap analysis (v1.3):** *"RF-041 — o motor de templates opera no contexto do onboarding; falta o
desacoplamento."*

---

## 1. Princípio: a SOP gera tarefas

O padrão *template → etapas → processo* já existe **duas vezes** (onboarding e legalização). Criar um
terceiro processo paralelo para SOPs seria a terceira cópia — e um terceiro painel para a equipe aprender.

Em vez disso, **a SOP gera tarefas**: cada etapa vira uma `tarefa` comum, com `sop_processo_id`. Assim
herda de graça tudo o que a Fatia A já entregou — painel lista/kanban, checklist, prazo, responsável,
seção na ficha do cliente — e a equipe não aprende nada novo.

## 2. Recorrência (RF-040)

`tarefa_recorrencia` guarda o **molde** (título, descrição, responsável, cliente, departamento,
prioridade, checklist-modelo) e a **regra**:

- `periodicidade`: `semanal` | `mensal` | `trimestral` | `anual`;
- `dia_semana` (0–6, para semanal), `dia_mes` (1–31, para as demais), `mes` (1–12, para anual);
- `antecedencia_dias` (padrão 3): quantos dias antes do prazo a tarefa nasce;
- `proxima_data`: o prazo da próxima ocorrência (o motor avança sozinho);
- `ativa`.

**Geração:** cron **diário** (o `pg_cron` já existe, como nas obrigações e na régua). Para cada
recorrência ativa, enquanto `proxima_data - antecedencia_dias <= hoje`, cria a tarefa com
`prazo = proxima_data` e avança `proxima_data` pela regra.

**Idempotência:** `tarefa.recorrencia_id` + `tarefa.competencia` (a data-alvo) + índice único
`(recorrencia_id, competencia)`. Uma reexecução do cron no mesmo dia não duplica — e o motor não depende
de "lembrar" o que já fez, o que é o que quebra quando o job falha no meio.

**Dia 31 em mês curto:** `dia_mes = 31` em fevereiro cai no **último dia do mês**, não pula o mês. Isso
vai numa função pura (`proximaData`), coberta por testes — é onde esse tipo de regra costuma errar.

**Decisão (usuário):** a próxima ocorrência nasce **pelo cron, com antecedência** — e não ao concluir a
anterior. Se dependesse da conclusão, esquecer de concluir uma tarefa **pararia a série inteira** em
silêncio.

## 3. Calendário (RF-042)

Terceira vista do painel de tarefas (`/tarefas?vista=calendario`), ao lado de lista e kanban: **grade
mensal** por `prazo`, com navegação de mês e os **mesmos filtros** já existentes (responsável, cliente,
departamento, status, prioridade). Tarefas sem prazo ficam numa faixa "sem prazo" — senão desapareceriam
da vista, que é pior do que aparecer fora do grid.

Vencidas em vermelho; hoje destacado. Reaproveita `TarefaView` e a `listarTarefas()` existentes: a vista
é só uma projeção, sem nova query.

## 4. SOPs (RF-041)

### 4.1 Modelo

```
sop_template (id, slug, nome, descricao, departamento, ativo)
sop_etapa    (id, template_id, onda int, ordem int, titulo, descricao,
              responsavel_papel papel, prazo_dias int, prioridade)
sop_etapa_item (id, etapa_id, descricao, ordem)      -- vira o checklist da tarefa
sop_processo (id, template_id, cliente_id null, data_inicio date, onda_atual int,
              status ('em_andamento'|'concluido'|'cancelado'), criado_por, criado_em)
```

E na tarefa: `sop_processo_id`, `sop_etapa_id`, `sop_onda int`.

**Sequencial × paralelo, sem máquina de estado nova:** etapas com a **mesma `onda`** são **paralelas**
(nascem juntas); **ondas** rodam em **sequência**. É o suficiente para expressar os dois casos do
requisito, e cabe num inteiro.

**Prazo relativo:** `prazo = data_inicio + prazo_dias` (o `prazo_dias` é contado do início do processo, não
da onda — assim mudar a ordem das ondas não reescreve prazos).

**Responsável por papel:** resolvido na geração, nesta ordem — (1) o `cliente_responsavel` do departamento
do template, se houver cliente; (2) o `contador_id` do cliente, se o papel for `contador`; (3) **ninguém**
(a equipe atribui). Nunca chutar um responsável só para não deixar vazio.

### 4.2 Avanço de onda — no banco, não na tela

Quando **todas** as tarefas da onda atual de um processo estão `concluida` ou `cancelada`, a **próxima
onda nasce**. Isso vai num **trigger `after update` em `tarefa`** (security definer), não numa server
action.

**Por quê:** hoje uma tarefa pode ser concluída pelo painel, pelo kanban ou pela ficha do cliente. Se o
avanço morasse na action, cada caminho precisaria lembrar de chamá-lo — e o que for esquecido deixa o
processo travado sem ninguém perceber. No trigger, qualquer caminho funciona, inclusive um `update` feito
por um script.

Sem próxima onda → o processo vira `concluido`.

### 4.3 Telas

- **Configurações → SOPs** (admin/assistente): CRUD de template e etapas (onda, título, descrição, papel,
  prazo em dias, prioridade, checklist), com uma prévia do fluxo por ondas.
- **Iniciar processo:** na **ficha do cliente** (SOP com cliente) e no painel de **Tarefas** (SOP interno,
  sem cliente). Escolhe o template e a data de início; as tarefas da onda 1 nascem na hora.
- **Acompanhamento:** seção "Processos" com template, cliente, onda atual e progresso (n/N tarefas
  concluídas), com link para as tarefas do processo.

## 5. Banco

`0091_tarefas_recorrencia.sql` (recorrência + colunas na tarefa + índice único) e
`0092_sop.sql` (tabelas SOP + colunas na tarefa + função e trigger de avanço de onda). Migrations
separadas porque a segunda depende da primeira só no nível da tabela `tarefa`, e porque um problema na SOP
não deve impedir a recorrência de entrar.

**RLS:** `tarefa_recorrencia`, `sop_template`, `sop_etapa`, `sop_etapa_item` — leitura para a equipe,
escrita para **admin/assistente**. `sop_processo` — leitura para a equipe; criação por
admin/assistente/contador. As tarefas geradas seguem as policies que já existem.

## 6. Testes

Unitários (vitest, sem rede), onde a regra realmente erra:
- `proximaData()`: mensal com dia 31 em fevereiro (→ último dia), virada de ano, semanal, trimestral,
  anual; `antecedencia` (nasce ou não hoje).
- `ondasDoTemplate()`: agrupamento de etapas por onda e cálculo do prazo relativo.
- Grade do calendário: primeira/última semana, meses de 28/30/31 dias, tarefas sem prazo.

RLS (`rls.test.sql`): financeiro **não** cria template de SOP nem recorrência; contador **não** edita
template; cliente do portal não vê nada disso.

## 7. Entrega

Migrations → lint/typecheck/test/build → deploy → **registrar o novo job pg_cron**
(`scripts/bootstrap-cron.mjs`, que já é a fonte de verdade dos jobs — a doc registra que jobs criados
"na mão" não sobrevivem a um restore).

Validar em produção: criar uma recorrência mensal e rodar o cron manualmente (a tarefa nasce; rodar de
novo não duplica); abrir o calendário e conferir os prazos; criar uma SOP de 2 ondas, iniciar num cliente,
concluir as tarefas da onda 1 e ver a onda 2 nascer sozinha.

**Versão:** `v5.26.0` (feature).
