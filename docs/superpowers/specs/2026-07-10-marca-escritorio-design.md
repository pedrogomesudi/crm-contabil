# Marca do escritório (identidade configurável) — Design (Sub-projeto A)

> **Status:** design aprovado · **Data:** 2026-07-10
> **Contexto:** primeiro de dois sub-projetos da "proposta comercial com modelo". Sozinho, entrega a
> **identidade configurável do escritório** — a semente do whitelabel (V9). O sub-projeto **B** (modelo
> de proposta + geração) consome esta marca como tags.

## 1. Objetivo

Hoje não existe uma identidade do escritório configurável: o mais próximo é o `nfse_config` (CNPJ, razão
social, endereço), que existe para fins **fiscais**. Não há logo nem uma noção de "marca". A plataforma
mira ser **whitelabel**, então o "quem propõe/quem cobra/quem atende" precisa vir de uma configuração,
não de valores fixos.

Este sub-projeto cria essa configuração: nome, CNPJ, endereço, e-mail, telefone e **logo**.

## 2. Decisões do brainstorming

- **Tabela própria `escritorio_config`**, não estender o `nfse_config`: identidade de marca ≠ config
  fiscal, e o logo não tem relação com NFS-e.
- **Logo no Storage** (bucket `documentos`, privado), como todo arquivo do projeto — não base64 no banco.
- **Estruturado para o whitelabel:** singleton `id = 1` hoje; quando a V9 chegar, `id` vira `tenant_id`
  e a RLS ganha o filtro por tenant — o shape dos campos não muda.

## 3. Modelo de dados

Migration `supabase/migrations/0076_escritorio_config.sql` (idempotente).

```sql
create table if not exists escritorio_config (
  id smallint primary key default 1 check (id = 1),  -- singleton; vira tenant_id na V9/whitelabel
  nome text,
  cnpj text,
  email text,
  telefone text,
  endereco jsonb,        -- mesmo shape de clientes.endereco: logradouro/numero/bairro/cidade/uf/cep
  logo_path text,        -- object name no bucket 'documentos', ou null
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references usuarios(id)
);
```

**RLS:** leitura por **qualquer autenticado** (`select using (true)`) — a marca aparece na proposta, que
muita gente gera; escrita só **admin** (`for insert/update` com `auth_papel() = 'admin'`). É o padrão do
`obrigacao_config`. Trigger de autoria (`atualizado_por`/`atualizado_em`), no padrão do projeto.

Semear a linha `id = 1` vazia na própria migration (`insert ... on conflict do nothing`), para o
`update` da action sempre encontrar a linha.

## 4. Upload e leitura do logo

- **`salvarMarca(_prev, formData)`** (server action, gate **admin**) — normaliza e grava os campos de
  texto/endereço via `update escritorio_config ... where id = 1`.
- **`salvarLogo(_prev, formData)`** (server action, gate **admin**) — recebe o arquivo, valida tipo
  (**PNG/JPG apenas** — ver §7) e tamanho (≤ 2 MB), sobe no bucket `documentos` em caminho determinístico
  `marca/logo-<epoch>.<ext>` via `createAdminSupabase` (upload é service_role, padrão do projeto), grava
  `logo_path`, e **remove o logo anterior** (se havia) para não acumular órfãos. O `<epoch>` novo evita
  cache velho ao trocar.
- **`urlLogo(): Promise<string | null>`** — devolve a **URL assinada (60s)** do `logo_path` via
  `createSignedUrl` (o bucket é privado; nada de URL pública permanente). Usada na tela e, na Fatia B,
  para embutir o logo na proposta.

O timestamp para o nome do arquivo vem de `Date.now()` **na server action** (nunca no render de
componente — regra `react-hooks/purity`).

## 5. Normalização (pura, testável)

`src/lib/escritorio/marca.ts` — `normalizarMarca(fd: FormData): DadosMarca | { erro: string }`, no
padrão de `normalizarExtensaoFinanceira`:

- `cnpj` → só dígitos; se preenchido, valida com `validarDocumento("PJ", cnpj)` (já existe em
  `src/lib/validation/documento.ts`); inválido → `{ erro }`.
- `email` → trim; se preenchido, validação simples de formato.
- `endereco` → monta o jsonb a partir dos campos planos (logradouro/numero/bairro/cidade/uf/cep);
  vazio → null.
- campos vazios → null.

```ts
export type DadosMarca = {
  nome: string | null;
  cnpj: string | null;
  email: string | null;
  telefone: string | null;
  endereco: Record<string, string> | null;
};
```

O `logo_path` não passa por aqui — é gravado só pela `salvarLogo`.

## 6. Tela `/configuracoes/marca`

- Gate **admin** (redirect se não for), no padrão das telas de config.
- Formulário: nome, CNPJ (máscara), e-mail, telefone, endereço (campos planos), com botão "Salvar".
- Bloco do logo: **preview do atual** (via `urlLogo()`) + input de upload (form separado, como o
  certificado da NFS-e).
- Link na página `/configuracoes` (hub), junto de NFS-e/WhatsApp/Boletos/etc.
- Aviso quando a marca ainda não foi preenchida ("Configure a marca para usar na proposta comercial").

## 7. Permissões e erros

- **Ver a marca:** qualquer autenticado (necessário para a proposta na Fatia B). **Editar:** só admin
  (gate no app **e** na RLS).
- **CNPJ inválido** → `{ erro }` da normalização.
- **Logo com tipo/tamanho fora do aceito** → recusa com mensagem clara; nada é gravado.
- **SVG é risco de XSS** (pode conter `<script>`). Decisão: **aceitar só PNG/JPG** neste sub-projeto —
  são o que um logo precisa, e elimina a superfície. SVG fica de fora (YAGNI + segurança). A validação
  confere o tipo pelo conteúdo (magic bytes), não só pela extensão, que é forjável.
- **Sem marca configurada** → só o aviso na tela (a Fatia B tratará as tags vazias).
- **Trocar o logo** → novo arquivo com novo nome; o anterior é **removido** no mesmo fluxo.

## 8. Testes

- **Unit `marca.ts`:** CNPJ só dígitos + validação (aceita válido, rejeita inválido); endereço montado;
  campos vazios → null; e-mail malformado → erro.
- **Unit (permissão):** o gate de edição usa `auth_papel()='admin'` — coberto pela RLS abaixo.
- **RLS (`supabase/tests/rls.test.sql`):** um não-admin (financeiro) **lê** `escritorio_config` mas o
  `update` **não** tem efeito (RLS de escrita admin-only); admin escreve com efeito.
- **E2E manual:** preencher a marca, subir um logo, ver o preview; entrar como financeiro e confirmar que
  a leitura funciona mas a edição é barrada.

## 9. Fora de escopo (consciente)

- Todo o **sub-projeto B** (modelo de proposta, motor de geração docx/HTML, tags, download).
- **Múltiplas marcas / multi-tenant** — é a V9; aqui o singleton `id = 1` já deixa o caminho.
- **Cores/tema por escritório** — tematização visual é V8/whitelabel; a marca aqui é identidade textual
  + logo.
