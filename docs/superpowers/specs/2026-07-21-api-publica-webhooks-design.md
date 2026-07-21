# RF-080 — API pública REST + webhooks de saída (design)

## Objetivo

Expor uma API REST versionada (`/api/v1`) autenticada por API key, com leitura e escrita dos
recursos centrais, e webhooks de saída assinados que empurram eventos para sistemas do cliente.
Desbloqueia o RF-083 (automação Make/n8n/Zapier). Tudo é greenfield.

## Contexto que simplifica

- **Single-tenant físico** (1 deploy/banco por escritório — `docs/DEPLOY.md`): uma API key é
  sempre "do escritório inteiro", sem discriminar tenant no banco.
- As rotas `/api/v1` rodam com **`service_role`** (bypassa RLS, como webhooks/crons já fazem); o
  controle de acesso é o **escopo da API key**, não a RLS por papel.
- Tijolos reutilizáveis: parser `Bearer` + `timingSafeEqual` (crons), `createAdminSupabase()`,
  `comTimeout` (`whatsapp/zapi.ts`), HMAC (`lib/assinatura/webhook.ts`), zod
  (`validation/cliente.ts`), padrão `route.ts` + `NextResponse.json`.

## Decisões (do brainstorm)

- Escopo v1: **leitura + escrita** dos 4 recursos (clientes, financeiro títulos/boletos,
  obrigações, documentos) **e** webhooks de saída — "os dois juntos".
- Escrita v1 inclui: criar/editar cliente, criar título + baixa, marcar obrigação entregue,
  upload de documento (todas **reusando** o núcleo de validação/regra existente).
- Eventos de webhook v1: `titulo.pago`, `titulo.criado`, `obrigacao.entregue`,
  `cliente.criado`, `cliente.atualizado`, `documento.enviado`.
- Entrega em **5 releases (A→E)**, spec compartilhada, plano por fatia.

## Arquitetura por bloco

### Bloco 1 — Autenticação de máquina (API keys) — Fatia A

**Migration `0126_api_keys.sql`:**
```sql
create table if not exists api_key (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  key_hash text not null unique,       -- sha256 hex da chave (nunca em claro)
  prefixo text not null,               -- primeiros ~10 chars, para exibição
  escopos text[] not null default '{}',
  criado_por uuid references usuarios(id),
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogada_em timestamptz
);
```
RLS: `enable row level security`; SELECT/ALL só `auth_papel()='admin'` (a UI lê via sessão). A
autenticação da própria API é via service_role (sem sessão).

**Chave:** formato `sk_<32 bytes base62>`. Gerada server-side, `key_hash = sha256(chave)`,
`prefixo = chave.slice(0, 10)`. A chave em claro é devolvida **uma única vez** na criação; depois
só o prefixo aparece.

**Escopos:** `clientes:read`, `clientes:write`, `titulos:read`, `titulos:write`,
`obrigacoes:read`, `obrigacoes:write`, `documentos:read`, `documentos:write`.

**Helper `autenticarApiKey(req, escopoNecessario)`** (`src/lib/api/auth.ts`, server-only):
- Extrai `Authorization: Bearer <chave>`; se ausente → `null` (401).
- `sha256(chave)` → `select ... from api_key where key_hash = $1 and revogada_em is null` (admin).
- Sem linha → 401. Sem `escopoNecessario` nos `escopos` → 403.
- Atualiza `ultimo_uso` (best-effort, no máximo 1×/min por chave para não escrever a cada request).
- Retorna `{ id, escopos }`.

**UI admin `/configuracoes/api`:** criar chave (nome + escopos; mostra a chave uma vez num aviso),
listar (nome, prefixo, escopos, último uso, status), revogar (`revogada_em = now()`). Gate admin.

**Rota de fumaça `GET /api/v1/ping`** (autenticada, escopo livre) para validar a fundação.

### Bloco 2 — API REST de leitura — Fatia B

- **`proxy.ts`:** excluir `/api/v1` do matcher (não há cookie a renovar).
- **Envelope e utilidades** (`src/lib/api/http.ts`): `ok(data, {paginacao})`, `erro(codigo, msg, status)`;
  paginação por `limit` (default 50, máx 200) + `offset`; resposta
  `{ dados: [...], paginacao: { limit, offset, total } }`; erros `{ erro: { codigo, mensagem } }`.
- **Serializadores** (`src/lib/api/serializar.ts`): `serializarCliente`, `serializarTitulo`,
  `serializarBoleto`, `serializarObrigacao`, `serializarDocumento` — DTOs estáveis que escondem
  colunas internas (`criado_por`, `dominio_snapshot`, caminhos de storage crus).
- **Rotas** (cada uma: `autenticarApiKey(req, '<recurso>:read')` → query admin com filtros → serializa):
  - `GET /api/v1/clientes` (filtros: `cpf_cnpj`, `status`, `q`) e `GET /api/v1/clientes/:id`.
  - `GET /api/v1/titulos` (filtros: `cliente_id`, `status`, `competencia`), `GET /api/v1/titulos/:id`,
    `GET /api/v1/boletos` (filtros: `titulo_id`, `status`).
  - `GET /api/v1/obrigacoes` (filtros: `cliente_id`, `competencia`, `status`), `.../:id`.
  - `GET /api/v1/documentos` (filtros: `cliente_id`, `tipo`, `competencia`) — **só metadados**.
- **Rate limit** (`src/lib/api/rate-limit.ts` + coluna/tab simples): contador por chave numa janela
  (ex.: 120 req/min); excedeu → 429 com `Retry-After`. Implementação in-DB (sem Redis).

### Bloco 3 — API REST de escrita — Fatia C

Princípio: **cada escrita reusa a validação e a regra que hoje vivem na Server Action**, extraindo
um núcleo puro-de-sessão compartilhado entre a action (UI) e a rota (API). Nada de reimplementar
regra de negócio.

- **`POST/PATCH /api/v1/clientes`** (escopo `clientes:write`): extrair `gravarCliente(input, ctx)`
  de `clientes/actions.ts` (validação via `clienteSchema`, montagem de endereço, insert/update); a
  action e a rota chamam o mesmo núcleo. Emite `cliente.criado`/`cliente.atualizado`.
- **`POST /api/v1/titulos`** e **`POST /api/v1/titulos/:id/baixa`** (escopo `titulos:write`):
  extrair o núcleo de criação de título e o de baixa (reaproveitando a lógica de
  `contas-a-receber`). Emite `titulo.criado`/`titulo.pago`.
- **`PATCH /api/v1/obrigacoes/:id`** (marcar entregue; escopo `obrigacoes:write`): extrair o núcleo
  de `darBaixa` (`obrigacoes/baixa-actions.ts`), gravando `entregue_por`/`entregue_em`. O
  `entregue_por` numa chamada por API não é um `usuarios.id` — usar `null` (ou um usuário técnico) e
  registrar a origem "api". Emite `obrigacao.entregue`.
- **`POST /api/v1/documentos`** (multipart; escopo `documentos:write`): extrair o núcleo de
  `anexarDocumento` (upload no Storage + insert + indexação de conteúdo). Emite `documento.enviado`.

Cada rota valida o corpo com o schema zod do recurso e devolve `422` com os erros de validação.

### Bloco 4 — Webhooks de saída — Fatia D

**Migrations:**
```sql
create table webhook_endpoint (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  secret text not null,                 -- para HMAC do payload
  eventos text[] not null default '{}', -- ex.: {'titulo.pago','obrigacao.entregue'}
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create table webhook_entrega (           -- outbox
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid not null references webhook_endpoint(id) on delete cascade,
  evento text not null,
  payload jsonb not null,
  status text not null default 'pendente', -- 'pendente' | 'ok' | 'falhou'
  tentativas int not null default 0,
  proximo_retry timestamptz not null default now(),
  criado_em timestamptz not null default now()
);
```
RLS admin nas duas; escrita da outbox via service_role.

- **`emitirEvento(evento, payload)`** (`src/lib/webhooks/emitir.ts`, server-only): para cada
  `webhook_endpoint` ativo cujo `eventos` contém `evento`, insere uma linha `pendente` em
  `webhook_entrega`. Chamado **nos pontos de efeito já existentes** (baixa de título, criação de
  título, `darBaixa` de obrigação, gravar cliente, upload de documento). É best-effort: falha ao
  enfileirar nunca derruba a operação principal.
- **Cron `/api/cron/webhooks-saida`** + `drenarWebhooks()`: pega `pendente` com
  `proximo_retry <= now()` (lote), faz `POST` com `comTimeout` e header
  `X-Webhook-Signature: sha256=<hmac(secret, corpo)>`; 2xx → `ok`; senão incrementa `tentativas`,
  agenda `proximo_retry` com backoff exponencial, e após N tentativas → `falhou`. Job em
  `bootstrap-cron.mjs` (ex.: a cada 5 min).
- **UI admin `/configuracoes/webhooks`:** cadastrar endpoint (url + eventos), ver secret uma vez,
  ativar/desativar, ver últimas entregas (status/tentativas).

### Bloco 5 — Documentação OpenAPI — Fatia E

- `openapi.json` construído a partir dos schemas zod dos recursos (via `zod-to-openapi` ou
  montagem manual do documento), servido por `GET /api/v1/openapi.json`.
- Página `/api/docs` renderizando um viewer OpenAPI **bundlado local** (`@scalar/api-reference` ou
  Redoc) — respeitando o CSP de `next.config.ts` (sem CDN; asset servido pelo próprio app).

## Testes

Foco em libs puras testáveis (a plumbing HTTP e as queries admin são verificadas por build + smoke):
- `src/lib/api/auth` — geração/hash de chave e checagem de escopo (parte pura).
- `src/lib/api/http` — paginação (clamp de `limit`, cálculo de `offset`), envelope de erro.
- `src/lib/api/serializar` — cada serializador esconde as colunas internas e mapeia o DTO.
- `src/lib/api/rate-limit` — a decisão pura "excedeu a janela?".
- `src/lib/webhooks/emitir` — seleção de endpoints por evento (parte pura de casamento).
- Núcleos de escrita extraídos: os testes existentes das actions continuam válidos; adicionar
  testes do núcleo onde a validação vive.

## Fora de escopo (v1)

OAuth/JWT de terceiros; GraphQL; paginação por cursor; CORS de browser; API keys por-usuário
(a chave é do escritório); webhooks de entrada novos (só saída); versionamento além de `/v1`;
rotas de escrita para boletos (só leitura de boleto no v1).

## Sequência de entrega (fatias → releases)

| Fatia | Entrega | Migration |
|---|---|---|
| A | API keys (tabela + auth + escopo) + UI admin + `GET /api/v1/ping` | 0126 |
| B | Leitura dos 4 recursos + envelope/paginação + rate limit | — |
| C | Escrita dos 4 recursos (extração de núcleos) | — (talvez coluna origem) |
| D | Webhooks de saída (endpoint + outbox + cron + emissão) + UI | webhook_* |
| E | OpenAPI JSON + página de docs | — |

Cada fatia é uma release independente e testável; a spec é a fonte comum e cada fatia ganha seu
próprio plano de implementação na hora de executar.
