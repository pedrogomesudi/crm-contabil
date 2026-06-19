# CRM Contábil — Fase 1 (Fundação) — Documento de Design

- **Data:** 2026-06-19
- **Autor:** Pedro Gomes (com Claude Code)
- **Status:** Aprovado para implementação (v4 — após 4 rodadas de revisão técnica)
- **Escopo deste documento:** Fase 1 (Fundação). As Fases 2–4 são citadas apenas como contexto.

---

## 1. Objetivo

Construir a fundação de um CRM web para um **escritório de contabilidade**: um sistema de
**login/senha** que dá acesso a um **dashboard** e a um **módulo de gestão de clientes**, com
**controle de permissões por papel**. Esta fase entrega um produto já utilizável no dia a dia
(cadastrar e gerenciar clientes) e a base técnica sobre a qual os módulos seguintes serão construídos.

### Critérios de sucesso da Fase 1

1. Um usuário convidado consegue fazer login com e-mail e senha e recuperar senha esquecida.
2. O Admin consegue convidar usuários e atribuir papéis.
3. Cada papel só acessa o que lhe é permitido — garantido no banco de dados (RLS), não apenas na interface.
4. É possível cadastrar, listar, buscar, visualizar, editar e inativar clientes.
5. O dashboard exibe números-resumo, atividade recente e atalhos rápidos.
6. É possível anexar documentos a um cliente.

---

## 2. Decomposição em fases (visão geral)

O CRM completo é grande demais para um único ciclo. Ele é fatiado assim:

| Fase | Entrega | Status |
|------|---------|--------|
| **1 — Fundação** | Login + papéis/permissões + dashboard + módulo Clientes | **este documento** |
| 2 — Leads | Funil de captação (lead → conversão em cliente) | futuro |
| 3 — Processos/Casos | Acompanhamento de obrigações/tarefas por cliente | futuro |
| 4 — Financeiro | Honorários, parcelas, inadimplência, receita | futuro |

Cada fase terá seu próprio ciclo design → plano → implementação.

---

## 3. Stack e arquitetura

### 3.1 Stack

- **Frontend/App:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Integração Supabase:** `@supabase/ssr` (createServerClient/createBrowserClient + middleware de
  refresh de sessão por cookies — obrigatório para sessão funcionar no App Router)
- **Backend gerenciado:** Supabase (nuvem) — Auth, Postgres, RLS (Row Level Security), Storage
- **Deploy:** EasyPanel (no VPS do usuário), build via Docker/Nixpacks, HTTPS e domínio próprio,
  imagem Next.js com `output: 'standalone'`
- **Schema versionado:** SQL via **Supabase CLI** (`supabase/migrations`) como fonte única de verdade
  do schema e das policies RLS (reproduzível dev→prod; nada de cliques soltos no painel)

### 3.2 Diagrama

```
┌─────────────────────────────────────────────┐
│   Navegador (equipe do escritório)           │
└───────────────────┬─────────────────────────┘
                    │ HTTPS (domínio próprio)
┌───────────────────▼─────────────────────────┐
│   EASYPANEL (VPS do usuário)                  │
│   • App Next.js + React + Tailwind            │
│     (deploy via Docker/Nixpacks, standalone)  │
│   • Route Handlers / Server Actions           │
│     (operações com service_role)              │
└───────────────────┬─────────────────────────┘
                    │ conexão segura (chaves de ambiente)
┌───────────────────▼─────────────────────────┐
│   SUPABASE (nuvem)                            │
│   • Auth (login/senha, sessão, reset)         │
│   • Postgres (usuarios, clientes,             │
│     clientes_financeiro, documentos)          │
│   • RLS (permissões por linha)                │
│   • Storage (bucket privado de documentos)    │
└─────────────────────────────────────────────┘
```

### 3.3 Variáveis de ambiente (build vs. runtime)

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`: usadas no client; **inlined em
  build-time** → precisam estar presentes no **ambiente de build do EasyPanel**.
- `SUPABASE_SERVICE_ROLE_KEY`: chave privilegiada; **apenas no runtime do servidor**, nunca
  prefixada com `NEXT_PUBLIC_`, nunca enviada ao navegador.
- Projeto Supabase e VPS devem ficar em **regiões próximas** (ex.: ambos em São Paulo) para evitar
  latência em cada request server-side.

### 3.4 Princípio de segurança

As permissões são aplicadas **no banco de dados** via Row Level Security (RLS). A interface esconde
ações que o usuário não pode executar, mas a regra que de fato protege os dados vive no Postgres:
mesmo uma requisição forjada não acessa o que o papel não permite. Operações privilegiadas
(convite/gestão de usuários) rodam **server-side** com a `service_role`.

---

## 4. Autenticação e papéis

### 4.1 Login e ciclo de vida do usuário

- **E-mail + senha** via Supabase Auth; **recuperação de senha** por e-mail.
- **Sem cadastro público:** sistema interno. Novos usuários entram apenas por **convite do Admin**.
- **Convite e gestão de usuários rodam exclusivamente server-side** (Route Handler / Server Action /
  Edge Function) usando a `service_role` (`auth.admin.inviteUserByEmail`, ativar/desativar, alterar
  papel). A `service_role` nunca vai ao navegador.
- Sessão gerida por cookies via `@supabase/ssr` + middleware de refresh; ao expirar, o usuário volta
  ao login com aviso claro.

### 4.2 Papéis

| Papel | Clientes (cadastrais) | Honorário (`clientes_financeiro`) | Usuários | Documentos |
|-------|----------------------|-----------------------------------|----------|------------|
| **Admin/Sócio** | vê e edita **todos** | vê e edita | gerencia (convida, define papel, ativa/desativa) | vê e gerencia |
| **Contador** | vê/edita os **atribuídos a ele** | vê e edita (dos seus clientes) | — | vê e gerencia (dos seus clientes) |
| **Assistente/Auxiliar** | cadastra/edita **todos** | **sem acesso** (nem leitura) | — | vê e gerencia |
| **Financeiro** | vê **todos** (leitura) | vê e edita | — | vê |

### 4.3 Atribuição de cliente a contador

Cada cliente tem um **contador responsável** (`contador_id`). O papel Contador só enxerga os clientes
em que ele é o responsável. Admin, Assistente e Financeiro enxergam todos (com as restrições da §4.2).

### 4.4 Como a RLS conhece o papel (mecanismo)

O papel mora em `usuarios.papel`. Para evitar **recursão de RLS** (uma policy de `clientes`
consultando `usuarios`, que também tem RLS) e problemas de performance, as policies usam uma função
auxiliar:

```sql
-- função STABLE SECURITY DEFINER que lê o papel do usuário corrente sem disparar RLS
create function auth_papel() returns text
  language sql stable security definer set search_path = public as
  $$ select papel from usuarios where id = auth.uid() $$;
```

As policies referenciam `auth_papel()` e `auth.uid()`. (Alternativa equivalente aceitável: papel como
**custom claim no JWT** via Custom Access Token Hook — decidir na implementação; o default é a função.)

**Blindagens obrigatórias da função (para o bypass de RLS realmente funcionar):**
- A função é **owned por um role que bypassa a RLS de `usuarios`** (o owner das tabelas); por isso o
  `SELECT` interno não dispara recursão de policy.
- `usuarios` **não usa `FORCE ROW LEVEL SECURITY`** (com FORCE, nem o owner bypassa, e a recursão volta).
- `EXECUTE` concedido a `authenticated`; a função só consulta `where id = auth.uid()` (cada um lê o
  próprio papel) e fixa `set search_path = public`.

### 4.5 Bootstrap do primeiro Admin e sincronização de perfil

- **Primeiro Admin (seed):** criado manualmente uma única vez (usuário no Supabase Auth + migration/seed
  inserindo a linha em `usuarios` com `papel='admin'`). Documentado no README de operação.
- **Sincronização `auth.users` → `usuarios`:** trigger `AFTER INSERT ON auth.users`
  (`handle_new_user`) cria a linha em `usuarios`. Regras obrigatórias:
  - O `papel` é lido de **`app_metadata`** (definido server-side com `service_role` no convite), **não**
    de `user_metadata` (que o próprio usuário pode manipular). Isso impede o convidado de escolher o
    próprio papel.
  - **Fallback:** se o papel vier ausente, assume `'assistente'` (papel de menor privilégio).
  - **Idempotência:** `insert ... on conflict (id) do nothing`, para o seed manual do primeiro Admin
    não colidir com o disparo do trigger.

---

## 5. Modelo de dados (Fase 1)

> Schema e policies definidos em migrations versionadas (Supabase CLI).

### 5.1 Tabela `usuarios`

Perfil da aplicação, 1:1 com `auth.users`.

| Campo | Tipo | Observação |
|-------|------|------------|
| `id` | uuid (PK) | igual ao `auth.users.id` |
| `nome` | texto | |
| `email` | texto | espelho do e-mail de login |
| `papel` | enum | `admin` \| `contador` \| `assistente` \| `financeiro` |
| `ativo` | booleano | usuário desativado não loga |
| `criado_em` | timestamp | |

**Policies de `usuarios` (enunciadas explicitamente):**
1. **SELECT própria linha** — `authenticated` lê apenas a linha onde `id = auth.uid()`.
2. **UPDATE própria linha** — `authenticated` pode atualizar a própria linha (`USING`/`WITH CHECK`
   `id = auth.uid()`), para editar dados pessoais como o `nome`.
3. **Listagem de todos / alteração de `papel`/`ativo` de qualquer usuário:** ocorre **apenas via fluxo
   server-side com `service_role`** (que bypassa RLS). Não há policy ampla de UPDATE/SELECT para
   `authenticated` além das duas acima.

> **Anti-escalonamento — por que precisa de trigger (não basta a policy de UPDATE):** a policy 2 acima
> deixa o usuário editar a própria linha; mas uma policy de UPDATE no Postgres valida a *linha final*,
> não *quais colunas mudaram* — então o usuário poderia trocar o próprio `papel` para `admin` e o
> `WITH CHECK` aprovaria. Fechamos isso com um **trigger `BEFORE UPDATE` em `usuarios`** que congela os
> campos sensíveis quando quem edita não é Admin:
>
> ```sql
> -- pseudocódigo da regra do trigger
> if coalesce(auth_papel(), '') <> 'admin' then
>   NEW.papel := OLD.papel;   -- congela
>   NEW.ativo := OLD.ativo;   -- congela
> end if;
> ```
>
> **Interação com `service_role` (intencional e blindada):** no fluxo Admin server-side, `auth.uid()`
> é `NULL` → o `coalesce(auth_papel(), '')` resulta em `''` (≠ `'admin'`)… o que **congelaria** —
> portanto o caminho legítimo de alteração de `papel`/`ativo` é o **`service_role`, que bypassa
> inclusive triggers de RLS-lógica? Não**: triggers comuns disparam mesmo para `service_role`. Por isso
> a regra do trigger deve **liberar explicitamente o caminho privilegiado**: a condição efetiva é
> `congela quando (auth.uid() is not null AND auth_papel() <> 'admin')`. Assim: usuário comun logado →
> congela; Admin logado → libera; `service_role` (`auth.uid() is null`) → libera. A guarda
> `auth.uid() is not null` é **obrigatória** e torna a intenção robusta mesmo se no futuro o papel
> migrar para custom claim no JWT (§11.5). Alternativa equivalente: `REVOKE UPDATE(papel, ativo)` de
> `authenticated` (column-level grant). O trigger é a opção recomendada.

### 5.2 Tabela `clientes` (cadastrais — sem dado financeiro)

| Grupo | Campo | Tipo | Observação |
|-------|-------|------|------------|
| Cadastrais/Fiscais | `tipo_pessoa` | enum | `PJ` \| `PF` \| `MEI` |
| | `razao_social` | texto | nome, no caso de PF |
| | `nome_fantasia` | texto | opcional |
| | `cpf_cnpj` | texto | validado por tipo (ver §7); único |
| | `regime_tributario` | enum | `Simples` \| `Presumido` \| `Real` \| `MEI` \| `Isento/PF` |
| | `inscricao_estadual` | texto | opcional |
| | `inscricao_municipal` | texto | opcional |
| Contato | `email` | texto | validado |
| | `telefone` | texto | telefone/WhatsApp |
| | `endereco` | `jsonb` | logradouro, número, bairro, cidade, UF, CEP |
| | `responsavel_nome` | texto | sócio/contato no cliente |
| Gestão interna | `contador_id` | uuid (FK→usuarios) | contador responsável |
| | `status` | enum | `ativo` \| `inativo` |
| | `data_inicio` | data | início do contrato |
| | `observacoes` | texto | livre |
| Auditoria | `criado_por` | uuid (FK→usuarios) | alimenta "atividade recente" |
| | `criado_em` | timestamp | |
| | `atualizado_em` | timestamp | atualizado a cada edição |

> **Honorário NÃO fica aqui.** Vai em `clientes_financeiro` (§5.3) — assim o Assistente faz
> `SELECT` normal em `clientes` (inclusive `select *`) sem nunca tocar no dado sensível.

### 5.3 Tabela `clientes_financeiro` (dado sensível separado)

Resolve a ocultação do honorário do Assistente por **RLS de linha** (que o Postgres suporta),
em vez de "RLS de coluna" (que não existe).

| Campo | Tipo | Observação |
|-------|------|------------|
| `cliente_id` | uuid (PK, FK→clientes) | 1:1 com cliente |
| `honorario_mensal` | numérico | campo sensível |
| `atualizado_por` | uuid (FK→usuarios) | |
| `atualizado_em` | timestamp | |

**RLS:** acesso (SELECT/INSERT/UPDATE) concedido a `admin`, `financeiro`, e ao `contador` dono do
cliente. O papel `assistente` **não tem nenhuma policy** aqui → não lê nem grava. Edições de cliente
pelo Assistente nunca incluem honorário, pois ele está em outra tabela à qual ele não tem acesso.

### 5.4 Tabela `documentos`

| Campo | Tipo | Observação |
|-------|------|------------|
| `id` | uuid (PK) | |
| `cliente_id` | uuid (FK→clientes) | |
| `nome` | texto | nome do arquivo |
| `tipo` | texto | ex.: contrato social, cartão CNPJ, procuração |
| `caminho_storage` | texto | path no bucket: `documentos/{cliente_id}/{arquivo}` |
| `enviado_por` | uuid (FK→usuarios) | |
| `enviado_em` | timestamp | |

### 5.5 Tabela `log_acesso_documento` (LGPD — rastreabilidade)

Registra quem **baixou** cada documento sensível.

| Campo | Tipo | Observação |
|-------|------|------------|
| `id` | uuid (PK) | |
| `documento_id` | uuid (FK→documentos, **nullable**) | `ON DELETE SET NULL` — log sobrevive à eliminação do doc |
| `usuario_id` | uuid (FK→usuarios) | quem baixou |
| `acessado_em` | timestamp | |

### 5.6 Storage

- **Bucket privado**; convenção de path `documentos/{cliente_id}/{arquivo}`.
- **Fonte de verdade do vínculo objeto→cliente:** a tabela `documentos` (`cliente_id` +
  `caminho_storage`), **não** o parsing do path. Todo upload é feito server-side, que grava a linha em
  `documentos` e usa exatamente a convenção de path. Policies de `storage.objects` validam via join com
  `documentos` por `caminho_storage` (evita fragilidade de extrair `cliente_id` do texto do path).
- **Escrita só via `service_role`:** **não há** policy de INSERT/UPDATE/DELETE em `storage.objects`
  para `authenticated` — todo upload/remoção passa pelo handler server-side. As policies de
  `authenticated` no bucket cobrem apenas **leitura defensiva** (SELECT validado por join com
  `documentos`). Isso impede um token válido de fazer PUT direto no bucket.
- **URLs assinadas geradas server-side**, após checar permissão e **registrar** o acesso em
  `log_acesso_documento` (o INSERT do log ocorre no mesmo handler server-side, **antes** de devolver a
  URL — assim o registro não é burlável pelo client).

---

## 6. Telas

### 6.1 Login
Logo + e-mail + senha + botão Entrar + link "Esqueci minha senha".

### 6.2 Dashboard (pós-login)
Layout com **menu lateral** (Início, Clientes, Configurações/Usuários) e área principal:
- **Números-resumo:** total de clientes, ativos, inativos, distribuição por regime tributário.
- **Atividade recente:** últimos clientes cadastrados/editados (origem: campos de auditoria).
- **Atalhos rápidos:** "+ Novo cliente", buscar cliente, "ver todos".

### 6.3 Lista de Clientes
Tabela paginada com **busca** (nome/CNPJ) e **filtros** (regime, status, contador).
Colunas e ações respeitam o papel do usuário.

### 6.4 Ficha do Cliente
Formulário em abas: **Cadastrais/Fiscais · Contato · Gestão interna · Documentos**. A aba de honorário
(dentro de "Gestão interna") só aparece para papéis com acesso. Ações (Salvar/Editar/Inativar/Anexar)
habilitadas conforme o papel. Inativar não apaga (soft inactivate via `status`); ver §10 sobre
eliminação definitiva.

### 6.5 Gestão de Usuários (apenas Admin)
Convidar usuário (e-mail + papel + nome), listar usuários, ativar/desativar, alterar papel.
**Todas essas ações chamam código server-side com `service_role`.**

---

## 7. Validações e tratamento de erros

- **Documento por tipo:** PF → valida **CPF**; PJ e **MEI** → validam **CNPJ**. `cpf_cnpj` único.
- **Combinação tipo × regime:** `tipo_pessoa=MEI` ⇒ `regime_tributario=MEI`; `PF` ⇒ `Isento/PF`;
  `PJ` ⇒ `Simples`/`Presumido`/`Real`. Validada no app **e** por **`CHECK` constraint no banco**
  (coerente com o princípio "regra no banco" da §3.4). A validação de dígito de CPF/CNPJ fica no app
  (cálculo pesado); a coerência tipo×regime e a unicidade de `cpf_cnpj` vivem no schema.
- **Campos obrigatórios:** `tipo_pessoa`, `razao_social`, `cpf_cnpj`, `regime_tributario`.
  (Honorário é opcional e fica em `clientes_financeiro`.)
- **CNPJ já cadastrado, porém inativo:** mensagem específica oferecendo **reativar** o cliente existente.
- **Erros de autenticação:** login inválido, sessão expirada, sem permissão → mensagens amigáveis,
  nunca tela em branco.
- **Acesso não autorizado:** bloqueado no banco (RLS) e sinalizado na interface.
- **Upload de documentos:** limite de tamanho e tipos aceitos (PDF/imagem); erro claro se exceder.

---

## 8. Estratégia de testes

- **Permissões (RLS) — antes da UI:** para cada papel, testar acesso permitido e bloqueio no resto.
  Casos-chave: Assistente **não acessa** `clientes_financeiro`; Contador só vê seus clientes (em
  `clientes`, `clientes_financeiro` e Storage); usuário comum não consegue alterar o próprio `papel`.
- **Validações:** CPF/CNPJ por tipo, combinação tipo×regime, e-mail, obrigatórios, unicidade.
- **Fluxo principal (ponta a ponta):** login → cadastrar cliente → aparece na lista e nos números do
  dashboard → anexar documento (gera log de acesso ao baixar) → inativar cliente.
- **Recuperação de senha:** fluxo de reset por e-mail.
- **Server-side:** convite de usuário usa `service_role` e a chave não vaza para o client.

---

## 9. Fora de escopo nesta fase

- Leads/funil (Fase 2), Processos/casos (Fase 3), Financeiro completo (Fase 4).
- Relatórios avançados e exportações.
- Integrações fiscais/governamentais (SEFAZ, eCAC etc.).
- Aplicativo móvel instalável (o acesso é web responsivo).
- O honorário é **armazenado e visível conforme o papel** já nesta fase (em `clientes_financeiro`),
  mas a gestão financeira (parcelas, cobrança, inadimplência) é da Fase 4.

---

## 10. Considerações de LGPD

O sistema trata dados pessoais e fiscais de clientes do escritório. Medidas na Fase 1:
- Dados em trânsito por HTTPS; banco gerenciado pelo Supabase (criptografia em repouso).
- Acesso por papel (mínimo necessário) imposto por RLS; honorário isolado em tabela própria.
- Documentos em bucket privado; download via URL assinada temporária gerada server-side.
- **Auditoria:** criação/edição de cliente (quem/quando) + **log de download de documentos**
  (`log_acesso_documento`).
- **Eliminação definitiva:** além do soft-inactivate (operacional), o Admin pode **excluir
  definitivamente** cliente e documentos (atende ao direito de eliminação do titular). Regras:
  - `clientes_financeiro` e `documentos` têm FK com **`ON DELETE CASCADE`** a partir de `clientes`
    (o DELETE no DB é atômico em uma transação).
  - Como o Storage é externo ao Postgres (não transacional), o handler server-side **remove primeiro
    os arquivos no Storage e só então o registro no DB**. A operação é **idempotente e retentável**
    (marca o cliente "em eliminação" no início); em falha parcial, a retentativa reprocessa, tratando
    tanto arquivos órfãos (arquivo sem linha) quanto registros órfãos (linha sem arquivo).
  - **Tensão LGPD — eliminação × auditoria:** o `log_acesso_documento` é prova de quem acessou dados
    sensíveis e **não deve ser apagado junto** com o documento. Portanto a FK
    `log_acesso_documento → documentos` usa **`ON DELETE SET NULL`** (não CASCADE): o documento some,
    mas o registro de auditoria permanece (com `documento_id` nulo). Decisão registrada em §11.

---

## 11. Decisões em aberto (a confirmar antes/durante a implementação)

1. **Provedor de e-mail** para convites e reset de senha (SMTP do Supabase vs. provedor próprio).
2. **Domínio** que será usado no EasyPanel.
3. Conjunto exato de **tipos de documento** padrão na lista (pode começar livre).
4. Política exata de **expiração de sessão** (tempo).
5. Mecanismo de papel na RLS: função `auth_papel()` (default) vs. custom claim no JWT — a confirmar.
6. **Reatribuição de `contador_id`:** definir se o Assistente pode trocar o contador responsável de um
   cliente (o que altera a visibilidade dos Contadores) ou se isso é **exclusivo do Admin**. Default
   sugerido: apenas Admin reatribui (validado no handler server-side). — *D4*
7. **Retenção do log de auditoria:** confirmada a preservação do `log_acesso_documento` mesmo após
   eliminação definitiva do cliente/documento (`ON DELETE SET NULL`). Validar período de retenção do
   log conforme política do escritório. — *D3*

---

## 12. Sequência sugerida de implementação (marcos verificáveis)

Mesmo escopo da Fase 1, ordenado para entregar valor verificável cedo (RLS testada **antes** da UI):

1. **Infra:** projeto Supabase, Supabase CLI + migrations, `@supabase/ssr`, deploy "hello world" no
   EasyPanel com env de build/runtime corretas.
2. **Auth + perfil:** tabela `usuarios`, trigger `handle_new_user`, bootstrap do primeiro Admin.
3. **RLS + testes:** função `auth_papel()` (com blindagens da §4.4), **trigger `BEFORE UPDATE` de
   proteção de `papel`/`ativo`** (§5.1), policies das 4 tabelas + `storage.objects`, suíte de testes
   de RLS (antes de qualquer UI), incluindo teste explícito de anti-escalonamento.
4. **CRUD Clientes:** cadastrais + `clientes_financeiro` com a regra do honorário.
5. **Documentos:** Storage, policies, URL assinada server-side, log de download.
6. **Dashboard:** números-resumo, atividade recente, atalhos.
