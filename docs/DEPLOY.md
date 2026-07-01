# Deploy — CRM Contábil (EasyPanel na Hostinger VPS)

Guia operacional da Fase 1. Substitua `crm.SEU-DOMINIO.com.br` pelo domínio escolhido.

- **VPS:** `srv1767582.hstgr.cloud` — IP `187.77.234.86` (EasyPanel).
- **Supabase:** mesmo projeto de desenvolvimento (já com migrations 0001–0011 aplicadas e admin criado).
- **Porta do app:** 3000 · **Health check:** `/api/health`.

---

## 1. DNS — apontar o domínio para o VPS

No painel de DNS do domínio (Wix, Hostinger ou outro registrador):

| Tipo | Nome/Host | Valor | TTL |
|------|-----------|-------|-----|
| `A`  | `crm` (ou `@` se domínio raiz) | `187.77.234.86` | padrão |

- Subdomínio de `gomesadvocacia.com.br` (DNS no Wix): adicione um registro **A** `crm` → `187.77.234.86`.
- Domínio próprio na Hostinger: aponte o **A** (ou os nameservers para a Hostinger) para o IP do VPS.
- Propagação leva de minutos a algumas horas. Confira com: `dig +short crm.SEU-DOMINIO.com.br`.

---

## 2. Criar o app no EasyPanel

No EasyPanel → **+ Service → App**.

### Opção A — GitHub (recomendado, auto-deploy)
1. Faça push deste repositório para um repo (privado) no GitHub.
2. App → **Source = GitHub** → selecione o repo e a branch `main`.
3. **Build = Dockerfile** (o `Dockerfile` na raiz já está pronto, output `standalone`).

### Opção B — Imagem Docker (sem GitHub)
1. Build local e push para um registry (Docker Hub privado grátis):
   ```bash
   docker build \
     --build-arg NEXT_PUBLIC_SUPABASE_URL="https://SEU-REF.supabase.co" \
     --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="sb_publishable_..." \
     --build-arg NEXT_PUBLIC_SITE_URL="https://crm.SEU-DOMINIO.com.br" \
     -t SEU-USUARIO/crm-contabil:0.1.0 .
   docker push SEU-USUARIO/crm-contabil:0.1.0
   ```
2. App → **Source = Docker Image** → `SEU-USUARIO/crm-contabil:0.1.0`.

> Em ambas as opções, **as `NEXT_PUBLIC_*` precisam estar no BUILD** (são embutidas no bundle).
> No GitHub/Dockerfile do EasyPanel, defina-as como **Build Args**.

### Variáveis (EasyPanel → Environment)

**Build args (NEXT_PUBLIC_\*, embutidas no build):**
```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...        # a publishable key (NÃO a anon JWT legada)
NEXT_PUBLIC_SITE_URL=https://crm.SEU-DOMINIO.com.br
```

**Runtime (secreta, só no servidor — NUNCA NEXT_PUBLIC):**
```
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...                 # marcar como secreto
```

> Não precisa de `SUPABASE_DB_URL`/`ADMIN_*` no runtime do app — essas são só do ferramental
> de banco (`scripts/*.mjs`), que roda na sua máquina, não no container.

### Rede / domínio
- **Port mapping:** container `3000`.
- **Domains:** adicione `crm.SEU-DOMINIO.com.br` → **HTTPS habilitado** (EasyPanel emite Let's Encrypt).
- **Health check:** `/api/health` (o Dockerfile já tem `HEALTHCHECK`; o EasyPanel também pode apontar para esse path).

---

## 3. Configurar URLs de Auth no Supabase

Supabase → **Authentication → URL Configuration**:
- **Site URL:** `https://crm.SEU-DOMINIO.com.br`
- **Redirect URLs (adicionar):**
  - `https://crm.SEU-DOMINIO.com.br/auth/confirmar`
  - `https://crm.SEU-DOMINIO.com.br/redefinir-senha`

> Sem isso, os links de **convite** e **recuperação de senha** apontam para o domínio errado e falham.
> O SMTP (Brevo) já está configurado e validado — não precisa mexer.

---

## 4. Admin de produção

O admin (`pedro@gomesadvocacia.com.br`) já existe no projeto Supabase e é `papel = admin` (ativo).
Nada a fazer. Se algum dia precisar recriar/promover um admin:
```bash
# na sua máquina, com .env.local apontando ao Supabase:
npm run admin:bootstrap
```

---

## 5. Verificação ponta a ponta (no domínio público)

1. `https://crm.SEU-DOMINIO.com.br/api/health` → `{"status":"ok"}`.
2. **Login** como admin.
3. **Convidar** um usuário → conferir e-mail de convite chegando → definir senha pelo link → entrar.
4. **Cliente:** cadastrar → **anexar** documento → **baixar** (gera log) → **inativar**.
5. Logar como **assistente** → confirmar honorário **invisível**.
6. Conferir headers em produção:
   ```bash
   curl -sI https://crm.SEU-DOMINIO.com.br/login | grep -iE "content-security|strict-transport|cross-origin"
   ```

---

## 6. Release

```bash
git tag -a v0.1.0-fase1 -m "Fase 1 (Fundação) no ar"
git push --tags        # se houver remoto
```

---

## Notas

- **Migrations em produção:** já aplicadas via runner próprio (`npm run db:migrate`) no mesmo projeto.
  Para novas migrations no futuro: rode `npm run db:migrate` e `npm run db:test` localmente apontando ao projeto.
- **Atualizar o app:** na Opção A, basta `git push` (auto-deploy). Na Opção B, rebuild + push da imagem e
  redeploy no EasyPanel.
- **Rollback:** o EasyPanel mantém histórico de deploys; reverta para o anterior pela UI.

## Gotenberg (conversão de contrato para PDF — V3)

A geração de contrato (V3) entrega o **Word** sempre; para o **PDF**, o app chama um serviço
**Gotenberg** (LibreOffice headless via HTTP). Sem ele, a geração funciona entregando só o `.docx`.

1. No EasyPanel, crie um novo serviço a partir da imagem **`gotenberg/gotenberg:8`** (porta interna `3000`).
2. Não precisa expor publicamente — basta a rede interna do projeto.
3. No serviço do app, defina a variável **`GOTENBERG_URL`** apontando para o serviço, ex.:
   `GOTENBERG_URL=http://gotenberg:3000` (use o hostname interno que o EasyPanel atribuir).
4. Os contratos contêm dados pessoais: manter o Gotenberg **na mesma infraestrutura** (não usar
   conversores SaaS externos) atende à LGPD.
