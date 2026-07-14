# Portal do cliente — Fatia B — Design

**Data:** 2026-07-14
**Contexto:** Continuação do RF-052. Entrega **upload de documentos pelo cliente** e o **rastreio de entrega (RF-053)**.

## Objetivo

1. O cliente **envia documentos** pelo portal; o upload **vira uma tarefa** interna, para que nada passe batido.
2. O escritório passa a saber **se o cliente viu** cada documento/guia — respondendo a pergunta que mais gera ligação: *"o cliente viu a guia?"*.

## Decisões (brainstorm)
1. **Upload cria uma tarefa automaticamente** (vinculada ao cliente, atribuída ao responsável do departamento Contábil ou ao contador do cliente).
2. **Rastreio registra e mostra "visualizado"** — sem reenvio automático (exigiria cron + regra de reenvio; fica para depois).

## Segurança — primeira escrita do papel `cliente`

Até aqui o `cliente` era **somente leitura**. A escrita é concedida da forma mais estreita possível:
- **Uma única** policy de INSERT, só em `documentos`, com `check (cliente_id = auth_cliente_id() and origem = 'cliente')`.
- **Sem UPDATE e sem DELETE** para o cliente (não altera nem apaga nada, nem o que enviou).
- O **caminho do arquivo é gerado no servidor** a partir de `perfil.clienteId` — nunca vem do navegador. A constraint `chk_caminho_prefixo` (já existente) exige que o caminho comece com o id do cliente, impedindo escrita na pasta de outro.
- O **INSERT usa o cliente Supabase do usuário** (não service_role), para que a RLS seja a barreira efetiva — defesa em profundidade.
- A **tarefa** é criada com `service_role` (o cliente não tem policy em `tarefa` — e não ganha).
- O **rastreio** é gravado **só server-side** (`service_role`): `portal_acesso` não tem policy de INSERT.

## Modelo de dados (migration 0086)

```sql
alter table documentos add column if not exists origem text not null default 'escritorio';
do $$ begin
  alter table documentos add constraint chk_doc_origem check (origem in ('escritorio','cliente'));
exception when duplicate_object then null; end $$;

-- ÚNICA escrita do papel cliente: enviar documento do próprio cadastro.
drop policy if exists documentos_portal_ins on documentos;
create policy documentos_portal_ins on documentos for insert to authenticated
  with check (cliente_id = auth_cliente_id() and origem = 'cliente');

do $$ begin create type portal_acesso_tipo as enum ('documento','nfse','obrigacao','boleto');
exception when duplicate_object then null; end $$;

create table if not exists portal_acesso (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  tipo portal_acesso_tipo not null,
  ref_id uuid not null,
  usuario_id uuid references usuarios(id),
  acessado_em timestamptz not null default now()
);
create index if not exists idx_portal_acesso_ref on portal_acesso (cliente_id, tipo, ref_id);

alter table portal_acesso enable row level security;
-- Equipe lê (herda a visibilidade do cliente). SEM policy de INSERT: só service_role grava.
drop policy if exists portal_acesso_sel on portal_acesso;
create policy portal_acesso_sel on portal_acesso for select to authenticated
  using (exists (select 1 from clientes c where c.id = cliente_id));
```

## Componentes

### Portal — upload
- `(portal)/portal/actions.ts` → `enviarDocumento(formData)`:
  - gate `ehCliente`; arquivo ≤10 MB; **magic bytes** (PDF/PNG/JPG — reusa `tipoComprovante`);
  - caminho `${perfil.clienteId}/${crypto.randomUUID()}-${nome}`; upload no bucket privado via `service_role`;
  - **INSERT em `documentos` com o supabase do usuário** (a RLS confirma o vínculo), `origem='cliente'`, `enviado_por = perfil.id`;
  - se o insert falhar, remove o arquivo (sem órfão);
  - **cria a tarefa** (service_role): título "Documento enviado pelo cliente: <nome>", `cliente_id`, `departamento='contabil'`, `prioridade='media'`, responsável = responsável do departamento Contábil (`cliente_responsavel`) ou, na falta, o `contador_id` do cliente.
- `/portal/documentos`: formulário de envio + a lista já existente.

### Portal — rastreio
- Toda action de download **registra o acesso** (service_role): `urlDocumento`→`documento`; `urlDanfse`→`nfse`; `urlComprovanteObrigacao`→`obrigacao`; novo `registrarAcessoBoleto(id)`→`boleto` (a 2ª via é link externo do provedor).

### Escritório — ver o que o cliente viu
- `src/lib/portal/rastreio.ts` (server): `ultimosAcessos(clienteId, tipo): Promise<Map<string, string>>` (ref_id → acessado_em).
- **Documentos da ficha:** coluna **"Visto pelo cliente"** ("visualizado em dd/mm" ou "não visualizado") + selo **"enviado pelo cliente"** quando `origem='cliente'`.
- **Obrigações da ficha:** por instância com comprovante, indicar se o cliente **já baixou**.

## Testes
- **RLS:** cliente **insere** documento do próprio cadastro (efeito) e **não** insere no de outro (barrado); **não** atualiza nem apaga documento; **não** escreve em `portal_acesso` nem em `tarefa`. Equipe **lê** `portal_acesso` do seu cliente.
- **Unit:** `ultimosAcessos` (pura sobre linhas).
- Suíte + `db:test` verdes antes de cada commit.

## Fora de escopo
- **Reenvio automático** dos não visualizados (WhatsApp/e-mail) — completa o RF-053 depois.
- Cliente apagar/renomear o que enviou.
- Fatia C: solicitações/tickets (RF-054).
