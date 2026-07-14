# V9 — Multi-tenant (um banco e um app por escritório) — Design

**Data:** 2026-07-14
**Marco:** V9 do gap analysis v1.3 — *"Multiempresa (multi-tenant) com isolamento lógico de dados por
escritório"*, listado como **pré-requisito de comercialização** junto com LGPD e envelope encryption.

---

## 1. A decisão e o que ela implica

**Modelo escolhido (usuário): um banco por escritório** — isolamento **físico**, não lógico. Um escritório
não consegue ler o dado de outro nem com uma policy esquecida, porque o dado não está no mesmo banco.

Consequência direta: como o Next **inlina as `NEXT_PUBLIC_*` no build** (a URL e a chave pública do Supabase
ficam dentro do JavaScript entregue ao navegador), um mesmo container não pode servir bancos diferentes.
Portanto: **um app por escritório** (container próprio + subdomínio próprio).

**O que isso significa para o código:** as **83 tabelas, 166 policies e 49 funções não mudam**. A aplicação
atual já é, literalmente, o SALDO de um escritório. O trabalho **não é SQL — é automação de
provisionamento**. E isso elimina de saída a classe de bug mais perigosa do multi-tenant compartilhado: o
vazamento por policy incompleta.

**O que fica mais caro:** cada escritório é um projeto Supabase (~US$ 25/mês) + um container. Dez
escritórios são dez bancos para migrar, dez conjuntos de cron, dez backups. Sem automação, isso vira
trabalho manual que **falha em silêncio** — um tenant sem cron não avisa ninguém; a régua simplesmente não
roda.

## 2. O provisionador

```
npm run tenant:novo -- --slug contabilx --nome "Contabilidade X" --email admin@contabilx.com.br
```

Executa, em ordem e **idempotente** (rodar de novo não estraga):

1. **Cria o projeto Supabase** via Management API (decisão do usuário). Token em
   `SUPABASE_ACCESS_TOKEN` (env, nunca commitado, nunca impresso — mascarado em qualquer log).
2. Aguarda o projeto ficar pronto e coleta: `project_ref`, URL, publishable key, service_role key,
   connection string.
3. **Roda as 95 migrations** (o runner atual, apontado para o banco novo).
4. **Gera os segredos do escritório** — `WHATSAPP_CRIPTO_KEY`, `ONBOARDING_CRIPTO_KEY`,
   `BOLETO_CRIPTO_KEY`, `EMAIL_CRIPTO_KEY`, `CRON_SECRET` — cada tenant com os **seus**. Vazar a chave de um
   não compromete os outros.
5. **Cria o admin** do escritório (reusa `bootstrap-admin.mjs`).
6. **Registra os 4 jobs pg_cron** apontando para o subdomínio dele (reusa `bootstrap-cron.mjs`).
7. **Grava `tenants/<slug>.env`** (fora do git, `chmod 600`) e atualiza `tenants/registry.json`.
8. **Imprime o bloco de env** pronto para colar no EasyPanel + o checklist do que resta fazer à mão
   (criar o app no EasyPanel, apontar o subdomínio).

**NÃO haverá `tenant:remover`.** O token de administração pode **destruir projetos inteiros**; expor isso
num script significa que um argumento errado apaga o banco de um cliente real. Criar é automatizável com
segurança; destruir, não — quem apaga é você, pelo painel, olhando para o nome do projeto.

## 3. Registro de escritórios

- `tenants/<slug>.env` — **segredos** (service_role, DB URL, chaves de cripto, CRON_SECRET). **Gitignored**,
  `chmod 600`. É a fonte para os laços e para reconfigurar um app.
- `tenants/registry.json` — **só metadados não sensíveis**: slug, nome, subdomínio, `project_ref`, data de
  criação. Este **pode** ser commitado (e é o que o `doctor` percorre).

Separar os dois é o que permite versionar a lista de escritórios sem versionar as credenciais deles.

## 4. Os laços (o que evita a falha silenciosa)

```
npm run db:migrate:all       # aplica as migrations pendentes em TODOS
npm run cron:bootstrap:all   # garante os 4 jobs em TODOS
npm run db:test:all          # roda os 101 asserts de RLS em TODOS
npm run tenant:doctor        # diagnóstico: quem está atrasado, sem cron, sem admin
```

A partir do segundo escritório, **esquecer um tenant é a falha clássica**: ele fica sem os crons e ninguém
percebe até a cobrança não sair. Por isso os `:all` **falham ruidosamente** (código de saída ≠ 0) se algum
tenant der erro — e o `doctor` responde, para cada escritório: está na mesma migration? tem os 4 jobs? tem
admin? as chaves estão presentes?

**Ordem de deploy passa a importar:** migrations **antes** do deploy do app (uma coluna nova que o código
espera e o banco não tem derruba o tenant). O `doctor` avisa quando um banco está atrás do código.

## 5. Segurança do provisionamento

- `SUPABASE_ACCESS_TOKEN` só em env, **nunca** no git, **nunca** impresso (mascarado como `sbp_***`).
- Os `tenants/*.env` entram no `.gitignore` **antes** de qualquer coisa ser escrita neles — e o script
  **aborta** se detectar que o diretório está versionado.
- O script **não apaga nada**: sem `tenant:remover`, sem `drop database`, sem `--force`.
- Cada tenant tem **chaves de cripto próprias** (isolamento de segredo, não só de dado).
- `--dry-run` mostra o que faria, sem criar projeto nem gravar arquivo.

## 6. O que fica de fora (e por quê)

- **Envelope encryption com rotação (V10-A):** hoje uma chave vazada não pode ser trocada sem perder o que
  está cifrado. Com um banco por escritório isso já fica **contido** (o estrago não atravessa tenants), o
  que torna o V10-A menos urgente — mas ainda necessário antes de comercializar.
- **LGPD (V10-B):** base legal por tratamento, consentimentos, direitos do titular e relatório de dados por
  cliente.
- **Backup com teste de restauração (RNF-06):** cada tenant tem seu backup; o teste periódico de restore é
  fatia própria.
- **Autosserviço:** não existe signup aberto. Quem provisiona é você (decisão do usuário).
- **Matriz de obrigações central:** cada escritório monta a sua (decisão do usuário) — o seed das ~9
  federais vem nas migrations e ele edita.

## 7. Validação

O teste de verdade é **criar o segundo escritório do zero** e ver o SALDO subir funcionando: login do admin,
migrations em dia, os 4 crons registrados, e o `doctor` verde para os dois. Um `--dry-run` antes, para
conferir sem gastar um projeto Supabase.

**Versão:** `v6.0.0` — **major**: muda a topologia de implantação do produto (de "o app" para "um app por
escritório"), o que quebra a suposição operacional anterior.
