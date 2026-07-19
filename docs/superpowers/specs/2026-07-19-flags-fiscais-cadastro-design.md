# Flags fiscais explícitas no cadastro — Design

**O que é:** deixar o contador **sobrescrever** no cadastro as três características fiscais que hoje o motor de
obrigações **deriva** (`tem_folha`, `contribui_icms`, `contribui_iss`), num controle **tri-state**: **Auto**
(deriva como hoje — padrão), **Sim**/**Não** (explícito). Fecha a última pendência do domínio **Cadastro do
cliente** (RF-026 e RF-027 já concluídos). **Uma fatia**; tem migration.

## O estado de hoje (medido)

- O motor de obrigações (`src/lib/obrigacoes/motor.ts`) monta, por cliente, um `ClienteFiscal` com `flags`
  **derivadas**:
  - `tem_folha: (qtd_funcionarios ?? 0) > 0` (de `clientes_financeiro.qtd_funcionarios`);
  - `contribui_icms: !!inscricao_estadual`;
  - `contribui_iss: !!inscricao_municipal`.
- A matriz de obrigações casa por essas flags via `condicaoFlags` + `condicaoModo` (`any`/`all`) em
  `obrigacaoAplica` (`src/lib/obrigacoes/geracao.ts`). As três flags acima são as únicas que o motor consulta.
- A derivação é uma heurística: ter inscrição estadual ≠ ser contribuinte de ICMS naquele período; nº de
  funcionários pode estar desatualizado. Não há como o contador corrigir a incidência sem mexer nos campos-base.
- Padrão de seção na aba cadastro reutilizável: `VinculosSection`/`OptOutLegalizacao` em
  `src/app/(app)/clientes/[id]/page.tsx` (componente client + action própria).

## Escopo (decidido no brainstorm)

- **Sobrescrita tri-state** das **três** flags que o motor usa. **Auto** = deriva como hoje (padrão);
  **Sim/Não** = explícito.
- Sem catálogo configurável, sem flags novas, sem regeneração retroativa.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Flags | as **3** que o motor consulta | Fecha a pendência sem inventar escopo. |
| Modelo | 3 colunas **nullable** em `clientes` (`null` = Auto) | Clientes atuais seguem derivando; nada muda até marcar. |
| Resolução | `explícito ?? derivado` | O explícito manda; senão, a derivação atual. |
| UI | seção "Flags fiscais" na aba cadastro, 3 selects Auto/Sim/Não | Molde de `VinculosSection`; baixo risco. |
| Efeito | vale para a **próxima geração** de obrigações | Não regenera o passado; simples e previsível. |

## Arquitetura

### Modelo de dados (migration 0113)

```sql
alter table clientes add column if not exists flag_tem_folha       boolean;  -- null = Auto (deriva)
alter table clientes add column if not exists flag_contribui_icms  boolean;
alter table clientes add column if not exists flag_contribui_iss   boolean;
```

Todas **nullable**, sem default — `null` significa "Auto/derivar". Herdam a RLS de `clientes`.

### Lógica pura (`src/lib/obrigacoes/flags.ts`)

```ts
// O explícito manda; null cai na derivação atual.
export function resolverFlag(explicito: boolean | null, derivado: boolean): boolean {
  return explicito ?? derivado;
}
```

### Motor de obrigações (`motor.ts`)

- O `select` de `clientes` passa a incluir `flag_tem_folha, flag_contribui_icms, flag_contribui_iss`.
- No bloco que monta `flags`, cada uma resolve o explícito sobre o derivado:

```ts
flags: {
  tem_folha:      resolverFlag((cl.flag_tem_folha as boolean | null) ?? null, (qtd ?? 0) > 0),
  contribui_icms: resolverFlag((cl.flag_contribui_icms as boolean | null) ?? null, !!cl.inscricao_estadual),
  contribui_iss:  resolverFlag((cl.flag_contribui_iss as boolean | null) ?? null, !!cl.inscricao_municipal),
},
```

O resto do motor (matriz, `obrigacaoAplica`, geração) não muda.

### Telas

- **`FlagsFiscaisSection`** (`src/components/clientes/FlagsFiscaisSection.tsx`) na aba cadastro, abaixo de
  `VinculosSection`: três selects **Auto / Sim / Não**, cada um mostrando ao lado o que a **derivação** daria
  hoje (ex.: "Auto → Sim (tem inscrição estadual)"), para o contador decidir com contexto. Uma legenda explica
  que "Auto" segue as inscrições e a folha, e que a mudança vale para a próxima geração de obrigações.
- **Action** `salvarFlagsFiscais(clienteId, { folha, icms, iss })` (`src/app/(app)/clientes/[id]/flags-actions.ts`):
  mapeia `"" → null`, `"sim" → true`, `"nao" → false`; grava as três colunas; `revalidatePath`. Gate: quem edita
  cadastro (mesmo critério das outras seções do cadastro).
- Carregar as três colunas + os valores derivados no `page.tsx` do cliente para pré-preencher a seção.

## Fatia de implementação

Uma fatia: migration 0113 + `resolverFlag` (com testes) + o merge no `motor.ts` + a `FlagsFiscaisSection` e a
action + o wiring no `page.tsx` + release.

## Verificação

- **Lógica testável:** `resolverFlag` — explícito `true`/`false` vence; `null` devolve o derivado.
- **Motor:** com `flag_* = null`, a incidência é idêntica à de hoje (não-regressão); com explícito, o motor usa
  o valor marcado (o teste de geração/`obrigacaoAplica` cobre a incidência resultante).
- **Tela:** render tri-state (Auto/Sim/Não) sem `border` à mão (guard `divida-ui`); o valor salvo pré-preenche.
- **Não-regressão:** sem rota nova → `rotas-alcancaveis` não muda; `lint`/`typecheck`/`test`/`format:check`/
  `build`; migration idempotente e **aplicada em produção antes do deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Flags além das três que o motor usa (ST, importador, etc.) | O motor não as consulta; entrariam com novas obrigações. |
| Regenerar retroativamente obrigações já geradas | A mudança vale para a próxima geração; evita reprocessar o passado. |
| Catálogo configurável de flags | Descartado no brainstorm; maior que a pendência. |
| Vigência das flags (histórico por competência) | O motor já tem vigência de regime; as flags aplicam ao valor atual. |

## Riscos

| Risco | Mitigação |
|---|---|
| Marcar "Não" remove obrigações da próxima geração | É o efeito desejado; a legenda da seção deixa claro. |
| Clientes antigos mudarem de comportamento | Colunas nullable sem default → todos ficam em "Auto"; nada muda até marcar. |
| Contador não entender "Auto" | Cada select mostra o valor derivado atual ao lado, com o motivo (inscrição/folha). |
| Divergência entre inscrição e flag explícita | É justamente o ponto: a flag explícita corrige a heurística; o cadastro das inscrições segue como está. |
