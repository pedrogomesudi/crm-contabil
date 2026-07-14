# Portal do cliente (RF-052) — Fatia A — Design

**Data:** 2026-07-14
**Contexto:** Prioridade 2 do roadmap. **Primeira superfície exposta ao cliente final** — a segurança é o eixo do desenho.

## Objetivo

O cliente do escritório entra num portal próprio e **consulta/baixa** o que é dele: **documentos**, **notas fiscais (DANFSe)**, **guias e comprovantes de obrigações** e **boletos (2ª via)**. Somente leitura nesta fatia.

## Decisões (brainstorm)

1. **Acesso por convite + senha:** o escritório convida o cliente pelo e-mail (fluxo Supabase, espelhando o convite de usuários já existente); o cliente define a senha e entra.
2. **Fatia A entrega tudo de leitura de uma vez:** documentos, NFS-e, guias de obrigações e boletos. Upload e solicitações (tickets) ficam para fatias seguintes.

## Segurança — o eixo do desenho

**Falha fechada por construção.** Todas as políticas de RLS existentes listam explicitamente os papéis de equipe (`admin`, `contador`, `assistente`, `financeiro`). Ao adicionar o papel **`cliente`**, ele é **negado por padrão em tudo**. Só então concedo, de forma explícita e estreita, **SELECT** nas linhas do próprio cadastro.

Riscos endereçados:
- **Sem cadastro público:** não existe `signUp` na aplicação — o acesso é só por convite (verificado).
- **Trigger `handle_new_user` cria perfil como `assistente`.** A action de convite (server-side, `service_role`) **define imediatamente** `papel='cliente'` e `cliente_id`, como já faz o convite de equipe.
- **Cliente jamais acessa telas de equipe:** o layout do grupo `(app)` passa a **redirecionar `papel='cliente'` para `/portal`**; o layout `(portal)` redireciona não-clientes para `/`.
- **Downloads:** a leitura do registro é feita com o cliente Supabase **do usuário** (a RLS prova a titularidade); só depois a URL assinada é gerada com `service_role`. Nunca se confia num id vindo do cliente sem passar pela RLS.
- **Sem escrita:** nenhuma policy de INSERT/UPDATE/DELETE para `cliente` nesta fatia.

## Modelo de dados (migrations)

**Migration A (isolada — valor de enum novo não pode ser usado na mesma transação):**
```sql
alter type papel add value if not exists 'cliente';
```

**Migration B:**
```sql
alter table usuarios add column if not exists cliente_id uuid references clientes(id) on delete cascade;

-- Cliente DEVE estar vinculado; equipe NUNCA tem vínculo.
alter table usuarios add constraint chk_usuario_cliente
  check ((papel = 'cliente' and cliente_id is not null) or (papel <> 'cliente' and cliente_id is null));

-- Id do cliente do usuário logado (null se não for papel 'cliente').
create or replace function auth_cliente_id() returns uuid
language sql stable security definer set search_path = public as $$
  select cliente_id from usuarios where id = auth.uid() and papel = 'cliente' and ativo
$$;
revoke all on function auth_cliente_id() from public;
grant execute on function auth_cliente_id() to authenticated;
```

### Políticas do portal (somente SELECT, aditivas)
```sql
-- próprio cadastro
create policy clientes_portal_sel on clientes for select to authenticated
  using (id = auth_cliente_id());
-- documentos do próprio cliente
create policy documentos_portal_sel on documentos for select to authenticated
  using (cliente_id = auth_cliente_id());
-- notas fiscais
create policy nfse_portal_sel on nfse for select to authenticated
  using (cliente_id = auth_cliente_id());
-- obrigações (guias/comprovantes)
create policy obrig_portal_sel on obrigacao_instancia for select to authenticated
  using (cliente_id = auth_cliente_id());
-- títulos do próprio cliente (contexto do boleto)
create policy titulo_portal_sel on titulo for select to authenticated
  using (cliente_id = auth_cliente_id());
-- boletos (via título)
create policy boleto_portal_sel on boleto for select to authenticated
  using (exists (select 1 from titulo t where t.id = boleto.titulo_id and t.cliente_id = auth_cliente_id()));
```
`auth_cliente_id()` retorna `null` para a equipe → estas policies **não ampliam** nada para quem não é cliente.

## Componentes e arquivos

### Tipos e perfil
- `src/lib/tipos.ts`: `PAPEIS` ganha `"cliente"`.
- `src/lib/auth/perfil.ts`: `PerfilAtual` ganha `clienteId: string | null`.
- `src/lib/portal/permissoes.ts`: `ehCliente(papel)`, `ehEquipe(papel)`.

### Convite do cliente
- `src/app/(app)/clientes/[id]/portal-actions.ts`:
  - `convidarClientePortal(clienteId, email)` — gate admin/assistente; `service_role`: `auth.admin.inviteUserByEmail`; em seguida `update usuarios set papel='cliente', cliente_id=…, nome=… where id=<novo>`. Idempotente (se já existe usuário com esse e-mail, apenas revincula/reenvia).
  - `revogarAcessoPortal(usuarioId)` — desativa (`ativo=false`).
- **Ficha do cliente:** seção **"Portal do cliente"** — mostra os acessos existentes, campo de e-mail + "Convidar", e "Revogar".

### Portal (grupo `(portal)`)
- `src/app/(portal)/layout.tsx` — gate: sem sessão → `/login`; `papel !== 'cliente'` → `/`. Layout próprio com a **Marca** do escritório (nome/logo), navegação simples e "Sair".
- Páginas: `/portal` (início: nome do cliente + atalhos), `/portal/documentos`, `/portal/notas`, `/portal/guias`, `/portal/boletos`.
- `src/app/(portal)/portal/actions.ts` — `baixarDocumento(id)`, `baixarDanfse(id)`, `baixarComprovante(id)`, `baixarBoleto(id)`: leem o registro **com o cliente do usuário** (RLS confirma a titularidade) e só então assinam a URL (`service_role`, 60s).
- **`(app)/layout.tsx`:** redirecionar `papel === 'cliente'` → `/portal`.

## Testes

- **RLS (`rls.test.sql`) — o coração:** criar um usuário `cliente` vinculado ao cliente A e provar que:
  - vê **apenas** o próprio cadastro, documentos, NFS-e, obrigações, títulos e boletos;
  - **não** vê os do cliente B;
  - **não** escreve (insert/update/delete negados) em nenhuma dessas tabelas;
  - **não** vê tabelas de equipe (ex.: `tarefa`, `usuarios` de terceiros, `escritorio_config` de escrita).
  - a constraint `chk_usuario_cliente` impede cliente sem vínculo e equipe com vínculo.
- **Unit:** `ehCliente`/`ehEquipe`.
- Suíte completa + `db:test` verdes antes de cada commit.

## Fora de escopo (fatias seguintes)
- **Fatia B:** upload de documentos pelo cliente; **rastreio de entrega** (visualizou/baixou — RF-053).
- **Fatia C:** central de **solicitações/tickets** (RF-054) com SLA e conversão em tarefa.
- Notificações ao cliente (e-mail/WhatsApp) sobre novidades no portal.
- PWA/app mobile (RF-056).
