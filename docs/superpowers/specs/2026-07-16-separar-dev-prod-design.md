# Separar o banco de dev do de produção — Design

**Problema:** `.env.local` e `tenants/gomes.env` apontam para o **mesmo** projeto Supabase
(`xeuujpop…`). O ambiente de desenvolvimento escreve no banco que atende o app em produção: `npm run dev`
edita dados de clientes reais, `admin:bootstrap` cria usuário lá, e `db:test` roda contra ele (em
transação com rollback, mas ainda assim contra produção). Não existe engano possível em dev que não
alcance o cliente.

**Objetivo:** um banco de desenvolvimento separado, onde errar não custa nada — e um isolamento que
venha da **credencial**, não da disciplina de quem digita.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde fica o dev | **Org nova, plano Free** | Plano é por organização. Dev sai de graça mesmo se a org de produção virar Pro, e credencial de dev não alcança produção. |
| Qual projeto vira dev | **Um novo, vazio** | Produção tem os dados reais; ela não se move. O que se move é o `.env.local`. |
| Conteúdo do dev | **Schema + admin. Sem dados.** | Copiar produção levaria dados pessoais reais a um ambiente menos protegido — contra a LGPD (V10-A) que o próprio sistema implementa. Seed fica para quando fizer falta (YAGNI). |
| Como criar | **Painel + `db:migrate` + `admin:bootstrap`** | Usa o ferramental existente, não escreve código novo e mantém `registry.json` só com escritórios reais. `tenant:novo` registraria o dev como escritório cliente, ligaria crons e exigiria o token que destrói projetos. |
| Crons em dev | **Não** | Dev não precisa de régua de cobrança acordando sozinha. |
| Chaves de cripto | **Próprias, geradas na hora** | Nunca as de produção. Hoje o `.env.local` não tem nenhuma (só `NFSE_CERT_KEY`), então as features cifradas nunca funcionaram localmente; o dev novo nasce completo. |

## Arquitetura

```
org "dev" (Free)                    org atual (produção)
└── crm-contabil-dev                └── xeuujpop… (INTOCADO)
    ├── 97 migrations                   ├── dados reais do escritório
    ├── admin (Pedro)                   ├── serve app.seusaldo.ai
    ├── chaves de cripto próprias       └── segredos no painel do EasyPanel
    └── sem crons, sem dados
         ▲
         └── .env.local (única coisa que troca de lado)
```

Produção não é tocada: o EasyPanel guarda os segredos no painel dele e `tenants/gomes.env` segue
descrevendo o tenant real. Nenhum passo deste design escreve no banco de produção.

## O que muda de comportamento

- `npm run dev`, `db:migrate`, `db:test` e `admin:bootstrap` passam a bater num banco vazio e descartável.
- **As integrações perigosas se desligam sozinhas:** `whatsapp_config`, `boleto_config` e `email_config`
  moram **no banco**. Num dev vazio elas nascem sem credencial, então dev não dispara mensagem, boleto
  nem e-mail para cliente real — sem código para isso.
- As integrações que vivem no env já apontavam para sandbox: `CLICKSIGN_URL=sandbox`,
  `NFSE_AMBIENTE=homologacao`, `NEXT_PUBLIC_SITE_URL=localhost`.

## Passos

**Humano (painel Supabase):** criar a org `dev` (Free) e o projeto `crm-contabil-dev` em `sa-east-1`
(dados no Brasil, como produção). Entregar: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_DB_URL` (Session pooler — o `db:test` exige).

**Automatizável:**

1. Guardar o `.env.local` atual como `.env.producao.bak` (fora do git — é o acesso a produção, não se
   joga fora) e confirmar que o `.gitignore` o cobre.
2. Apontar o `.env.local` para o dev e gerar as 7 chaves novas (`openssl rand`): `MASTER_CRIPTO_KEY`,
   as 5 de domínio (`WHATSAPP_`, `ONBOARDING_`, `BOLETO_`, `EMAIL_CRIPTO_KEY`, `NFSE_CERT_KEY`) e
   `CRON_SECRET`.
3. **Provar o alvo antes de escrever:** a tabela `clientes` do banco apontado tem de estar **vazia** e o
   host tem de ser diferente do de produção. Se não estiver, abortar — é o único passo que impede rodar
   `admin:bootstrap` em produção por engano.
4. `npm run db:migrate` (97) → `npm run cripto:migrar` → `npm run admin:bootstrap` → `npm run db:test`.
   O `cripto:migrar` é obrigatório e fácil de esquecer: a migration cria a tabela `chave_dados` vazia, e
   é ele que embrulha as 5 DEKs com a mestra. Sem isso o envelope não tem chave e as features cifradas
   quebram — é o que o `tenant:novo` faz na linha 292, e aqui não passa pelo `tenant:novo`.
   Conferir com `npm run tenant:doctor`, que checa as 5 DEKs.

## Verificação (evidência, não impressão)

- **Dev:** as 97 migrations em `app_migrations`, as 5 DEKs (`tenant:doctor`), o admin criado, `db:test`
  verde, `npm run dev` sobe e loga.
- **Produção intocada:** contar `clientes` **antes e depois** de tudo — o número não muda. Conferir que
  o `.env.local` não contém mais nenhuma credencial de produção.
- **Isolamento:** com o `.env.local` novo, uma consulta pelo cliente real conhecido não acha nada.

## Riscos

| Risco | Mitigação |
|---|---|
| Rodar `admin:bootstrap` achando que é dev, mas ainda em produção | O passo 3: provar que `clientes` está vazia **antes** de qualquer escrita. `db:migrate` seria inofensivo (as 97 já estão aplicadas), mas o bootstrap não. |
| Perder o acesso a produção ao sobrescrever o `.env.local` | Backup em `.env.producao.bak`, verificado antes de sobrescrever. |
| Projeto Free pausa após 7 dias de inatividade | Aceito: é dev, despausar é um clique no painel. |
| Chave de produção vazar para o dev | As chaves de dev são **geradas**, nunca copiadas. |

## Fora de escopo

Migrar dados para o dev; seed; CI apontando para um banco; mexer no que o EasyPanel usa.
