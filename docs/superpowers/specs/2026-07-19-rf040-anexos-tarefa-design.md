# RF-040 (anexos em tarefas) — Design

**O que é:** permitir **anexar arquivos a uma tarefa** (avulsa ou recorrente), na página de detalhe da
tarefa. É o **último gap** do RF-040 — todo o resto (responsável, prazo, prioridade, checklist, recorrência,
e as vistas Kanban/lista/calendário do RF-042) já está em produção. **Uma fatia**; tem migration.

## O estado de hoje (medido)

- O módulo de tarefas já existe e é amplo: `tarefa` (`0083` — responsável, cliente, departamento, prioridade,
  prazo, status), checklist em `tarefa_item`, recorrência em `tarefa_recorrencia` (`0091`) + tela de config,
  timesheet ligado por `tarefa_id` (`0094`), e SOPs que geram itens de checklist (`0092`). A migration `0083`
  se intitula *"RF-040/042 (Fatia A): tarefas internas com checklist"*.
- A página `/tarefas` tem as **três vistas** (lista, kanban, calendário) com filtros por responsável, cliente,
  departamento, status e prioridade — **RF-042 completo**.
- **Não há anexos:** nenhuma tabela de anexo de tarefa, e `documentos` não referencia `tarefa_id`.
- Padrão de anexo reutilizável (GED): tabela `documentos` (`cliente_id NOT NULL`, `caminho_storage` único),
  bucket **"documentos"** no Storage, `anexarDocumento` (upload via `createAdminSupabase`, valida PDF/PNG/JPG
  até 10 MB), `gerarLinkDownload` (URL assinada 60s), `excluirDocumento` (remove linha + objeto). Componentes
  `UploadDocumento`/`BotaoBaixar`/`BotaoExcluirDocumento` são presos a `clienteId`.
- Detalhe da tarefa em `src/app/(app)/tarefas/[id]/page.tsx` (checklist `tarefa_item`, `EditorTarefa`, horas de
  timesheet). Permissão de gestão: `podeGerenciarTarefas`.

## Escopo (decidido no brainstorm)

- **Tabela própria `tarefa_anexo`**, separada do GED do cliente (anexo de tarefa é operacional; não entra no
  arquivo oficial do cliente, mesmo quando a tarefa tem cliente). Funciona para **tarefa interna** (sem cliente).
- **Reusa o bucket "documentos"** com prefixo `tarefas/…` — sem bucket novo.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde guardar | tabela `tarefa_anexo` | Separa do GED; cobre tarefa interna. |
| Storage | bucket "documentos", prefixo `tarefas/<tarefa_id>/` | Bucket já existe e é service_role. |
| Limites do arquivo | PDF/PNG/JPG, até 10 MB | Iguais ao GED (consistência). |
| RLS | espelha `tarefa` | Quem vê a tarefa vê os anexos; quem edita, gerencia. |
| Download | URL assinada 60s (`createSignedUrl`) | Mesmo padrão do GED. |
| Log de acesso LGPD | **não** | Anexo interno de tarefa, não é dado pessoal do cliente. |

## Arquitetura

### O modelo de dados (migration 0110)

```sql
create table if not exists tarefa_anexo (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references tarefa(id) on delete cascade,
  nome text not null,
  caminho_storage text not null unique,
  enviado_por uuid references usuarios(id),
  enviado_em timestamptz not null default now()
);
alter table tarefa_anexo enable row level security;

drop policy if exists tarefa_anexo_sel on tarefa_anexo;
create policy tarefa_anexo_sel on tarefa_anexo for select to authenticated
  using (exists (select 1 from tarefa t where t.id = tarefa_id));
drop policy if exists tarefa_anexo_ins on tarefa_anexo;
create policy tarefa_anexo_ins on tarefa_anexo for insert to authenticated
  with check (exists (
    select 1 from tarefa t where t.id = tarefa_id
    and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())
  ));
drop policy if exists tarefa_anexo_del on tarefa_anexo;
create policy tarefa_anexo_del on tarefa_anexo for delete to authenticated
  using (exists (
    select 1 from tarefa t where t.id = tarefa_id
    and (auth_papel() in ('admin','assistente') or t.responsavel_id = auth.uid() or t.criado_por = auth.uid())
  ));
```

O `select` reusa a RLS de `tarefa` (o `exists` só passa se o usuário enxerga a tarefa). `on delete cascade`
remove as linhas quando a tarefa é apagada.

### A lógica pura (`src/lib/tarefas/anexo.ts`)

O único ponto que vale isolar/testar — montar o caminho de storage com nome saneado:

```ts
// Sanea o nome (sem acentos, espaços → "_", remove barras) e monta o caminho no bucket.
export function caminhoAnexoTarefa(tarefaId: string, nomeArquivo: string, id: string): string;
// -> `tarefas/${tarefaId}/${id}-${nomeSaneado}`
```

Regras: minúsculas opcionais não; troca espaços por `_`; remove `/`, `\` e caracteres de controle; tira
acentos (normalize NFD + strip diacríticos); colapsa repetições; preserva a extensão.

### As actions (`src/app/(app)/tarefas/[id]/anexo-actions.ts`)

No molde de `documentos/actions.ts` (checa permissão na app; usa `createAdminSupabase` para storage/insert):

- `anexarTarefaArquivo(tarefaId: string, _prev: EstadoUpload, formData: FormData): Promise<EstadoUpload>` —
  lê `arquivo`; valida tipo (PDF/PNG/JPG) e tamanho (≤ 10 MB); confirma que o usuário pode gerenciar a tarefa
  (`podeGerenciarTarefas` **ou** ser `responsavel_id`/`criado_por`); sobe ao bucket em
  `caminhoAnexoTarefa(...)`; insere a linha (`enviado_por = auth.uid()`); em falha de insert, remove o objeto
  do storage (evita órfão). Reusa o tipo `EstadoUpload` do GED (`documentos/estados`).
- `listarAnexosTarefa(tarefaId): Promise<{ id; nome; enviado_em }[]>`.
- `linkDownloadAnexo(anexoId): Promise<{ url?: string; erro?: string }>` — URL assinada 60s.
- `excluirAnexo(anexoId, tarefaId): Promise<{ erro?: string }>` — remove a linha e o objeto do storage;
  mesma checagem de permissão.

### As telas

Uma seção **"Anexos"** em `tarefas/[id]/page.tsx` (junto de checklist/horas), via novo componente
`src/components/tarefas/AnexosTarefa.tsx`: lista os anexos com **baixar** (chama `linkDownloadAnexo` e abre a
URL) e **remover** (gated), e um **formulário de upload** (`input type=file` com `controleCls`). Os componentes
do GED são presos a `clienteId`, então não dá para reusar direto — mas o padrão (useActionState + reset no
sucesso) é o mesmo. A seção só permite anexar/remover para quem pode gerenciar a tarefa.

## Fatia de implementação

Uma fatia: migration + `caminhoAnexoTarefa` (com teste) + as actions + a seção `AnexosTarefa` na página +
release.

## Verificação

- **Lógica testável:** `caminhoAnexoTarefa` — saneamento (acentos, espaços, barras), prefixo `tarefas/<id>/`,
  extensão preservada.
- **Anexo:** validação de tipo/tamanho; upload grava linha só em sucesso; em falha de insert, o objeto é
  removido; download por URL assinada; remoção limpa linha + storage; permissão espelha a RLS.
- **Não-regressão:** guard `divida-ui` (input `file` via `controleCls`, sem `border` à mão); `lint`,
  `typecheck`, `test`, `format:check`, `build`; sem rota nova → `rotas-alcancaveis` não muda; migration
  idempotente e **aplicada em produção antes do deploy**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Log de acesso (LGPD) dos anexos de tarefa | Interno; não é dado pessoal do cliente. |
| Versionamento de anexos | RF de GED, não deste gap. |
| Espelhar o anexo no GED do cliente | Decidido: `tarefa_anexo` é separado. |
| Anexos em recorrências (modelo) | O anexo é da instância da tarefa, não do template de recorrência. |

## Riscos

| Risco | Mitigação |
|---|---|
| Apagar a tarefa deixa objetos órfãos no storage | `on delete cascade` limpa as linhas; objetos ficam órfãos — mesmo tradeoff do GED atual, limpável depois. |
| Falha de insert após upload | A action remove o objeto do storage no catch (sem órfão no caso comum). |
| Upload pesado/timeout | Mesma latência do upload de documento já em produção; limite de 10 MB. |
| Nome de arquivo malicioso (path traversal) | `caminhoAnexoTarefa` remove `/`, `\` e controla o nome; o caminho é derivado, não confiado do cliente. |
