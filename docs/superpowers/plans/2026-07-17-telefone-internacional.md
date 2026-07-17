# Telefone internacional (DDI no cadastro) — Plano

> **Para executores:** implemente tarefa a tarefa. Cada tarefa termina com verificação e commit.
> Spec: `docs/superpowers/specs/2026-07-17-telefone-internacional-design.md`.

**Objetivo:** um campo de DDI (código do país) antes do telefone, para o envio de WhatsApp funcionar fora
do Brasil — hoje o DDI `55` é chutado em qualquer número.

**Arquitetura:** coluna nova `telefone_ddi` (default `'55'`, aditiva) + `normalizarTelefone`/`chaveTelefone`
passam a receber o DDI. O nono dígito brasileiro roda só quando DDI = 55. Os 6 pontos que enviam/casam
telefone passam a ler `telefone_ddi` junto com `telefone`.

**Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), TypeScript, Zod, vitest.

## Global Constraints

- **Nenhuma mudança de comportamento para o Brasil.** Todo cliente BR (os 99 atuais) continua idêntico —
  o default `"55"` e a compat de "número que já vem com 55" preservam a chave brasileira byte a byte.
- **`telefone` não muda de formato** — segue guardando só o número local.
- **DDI nunca em branco:** vazio → `"55"`.
- **Normalização de dígitos por país fica FORA** (o nono dígito de outros países etc.) — precisaria de
  `libphonenumber`. Idem seletor de país com bandeira e campo de DDI no `Inbox`.
- **Migrations imutáveis:** nova migration, idempotente (`add column if not exists`). Aplicar com
  `npm run db:migrate` (NÃO `supabase db push`).
- **`main` protegido:** entrega por PR de `develop` com o job `verify` verde.
- **O merge NÃO publica.** Deploy = botão **Implantar** no EasyPanel; confirmar em
  `https://app.seusaldo.ai/api/health`. A tag vem depois do health.
- Rodar antes de cada commit: `npm run lint`, `npm run typecheck`, `npm test`, `npm run format`,
  `npm run build`.

## Estrutura de arquivos

| Arquivo | O quê | Tarefa |
|---|---|---|
| `supabase/migrations/0098_telefone_ddi.sql` | **Criar** — a coluna | 1 |
| `src/lib/whatsapp/mensagem.ts` | **Modificar** — `normalizarTelefone`/`chaveTelefone` recebem `ddi` | 2 |
| `src/tests/whatsapp/mensagem.test.ts` | **Modificar** — casos DDI 55/1/351 | 2 |
| `src/lib/validation/cliente.ts` | **Modificar** — schema aceita `telefone_ddi` | 3 |
| `src/components/FormCliente.tsx` | **Modificar** — campo DDI + tipo | 3 |
| `src/app/(app)/clientes/actions.ts` | **Modificar** — normaliza o DDI ao salvar | 3 |
| `src/lib/comunicados/segmento.ts` | **Modificar** — `ClienteAlvo.telefoneDdi` | 4 |
| `src/app/(app)/comunicados/actions.ts` | **Modificar** — select + map + envio | 4 |
| `src/app/(app)/nfse/lote/envio.ts` | **Modificar** — select + envio | 4 |
| `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts` | **Modificar** — select + envio | 4 |
| `src/lib/whatsapp/regua-motor.ts` | **Modificar** — select + envio | 4 |
| `src/app/(app)/atendimento/actions.ts` | **Modificar** — 3 casamentos + selects | 5 |
| `src/app/api/webhooks/zapi/[secret]/route.ts` | **Modificar** — select + casamento | 5 |
| `docs/design/...`, `CHANGELOG.md` | **Modificar** | 6 |

---

### Task 1: A coluna `telefone_ddi`

**Files:**
- Create: `supabase/migrations/0098_telefone_ddi.sql`

**Interfaces:**
- Produces: coluna `clientes.telefone_ddi text not null default '55'`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0098_telefone_ddi.sql
-- DDI (código do país) do telefone do cliente. Aditivo: o número local segue em `telefone`.
-- default '55' faz todo cliente existente já ficar correto — sem migração de dados.
alter table clientes add column if not exists telefone_ddi text not null default '55';
```

- [ ] **Step 2: Aplicar**

Run: `npm run db:migrate`
Expected: aplica `0098` e registra em `app_migrations`. Se `SUPABASE_DB_URL` não estiver setado, avisar o
Pedro — ele roda (é o banco de dev). Não seguir sem a coluna aplicada.

- [ ] **Step 3: Confirmar que as RPCs de importação NÃO precisam mudar**

Ler `supabase/migrations/0016_importacao_aplicar_rpc.sql` e `0027_import_nao_altera_existentes.sql`: os
`insert into clientes (...)` **não** listam `telefone_ddi`, então a coluna cai no default `'55'`. Confirmar
lendo — se algum listar `telefone_ddi`, parar e avisar. (Esperado: nenhum lista; nada a fazer.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0098_telefone_ddi.sql
git commit -m "feat(db): coluna telefone_ddi (default 55) para telefone internacional"
```

---

### Task 2: `normalizarTelefone`/`chaveTelefone` recebem o DDI

**Files:**
- Modify: `src/lib/whatsapp/mensagem.ts:1-18`
- Test: `src/tests/whatsapp/mensagem.test.ts`

**Interfaces:**
- Produces:
  - `normalizarTelefone(local: string, ddi?: string): string | null` — default `ddi = "55"`.
  - `chaveTelefone(local: string, ddi?: string): string | null` — default `ddi = "55"`.
  - Contrato preservado: chamada com **um** argumento = comportamento brasileiro de hoje.

- [ ] **Step 1: Escrever os testes que faltam**

Acrescentar a `src/tests/whatsapp/mensagem.test.ts` (os testes existentes ficam — provam a não-regressão):

```ts
describe("normalizarTelefone — internacional", () => {
  it("DDI explícito monta ddi + número", () => {
    expect(normalizarTelefone("555 123 4567", "1")).toBe("15551234567"); // EUA
    expect(normalizarTelefone("912 345 678", "351")).toBe("351912345678"); // Portugal
  });
  it("sem DDI, assume 55 (comportamento atual)", () => {
    expect(normalizarTelefone("(34) 99999-8888")).toBe("5534999998888");
  });
  it("número que JÁ vem com 55 e comprimento BR é respeitado (compat)", () => {
    expect(normalizarTelefone("5534999998888", "55")).toBe("5534999998888");
  });
  it("número curto/absurdo → null", () => {
    expect(normalizarTelefone("123", "1")).toBeNull();
    expect(normalizarTelefone("", "1")).toBeNull();
  });
});

describe("chaveTelefone — só o BR ganha o nono dígito", () => {
  it("EUA (DDI 1) não insere o 9", () => {
    expect(chaveTelefone("5551234567", "1")).toBe("15551234567");
  });
  it("Portugal (DDI 351) não insere o 9", () => {
    expect(chaveTelefone("912345678", "351")).toBe("351912345678");
  });
  it("BR sem DDI continua ganhando o 9 (não-regressão)", () => {
    expect(chaveTelefone("(34) 8840-3020")).toBe("5534988403020");
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/tests/whatsapp/mensagem.test.ts`
Expected: FAIL — `normalizarTelefone` só aceita 1 argumento hoje; os casos internacionais quebram.

- [ ] **Step 3: Implementar**

Substituir as linhas 1–18 de `src/lib/whatsapp/mensagem.ts`:

```ts
// Monta o número no formato Z-API: DDI + número local, só dígitos.
// O ddi vem do cadastro (coluna telefone_ddi); default "55" preserva o comportamento brasileiro
// de quem chama com um argumento só.
export function normalizarTelefone(local: string, ddi: string = "55"): string | null {
  const d = String(local ?? "").replace(/\D/g, "");
  const dd = String(ddi ?? "55").replace(/\D/g, "") || "55";
  // Compat: número BR que já vem com o 55 na frente (dados/webhook antigos, 12–13 díg) é respeitado.
  if (dd === "55" && (d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  if (d.length < 6 || d.length > 15) return null; // fora do intervalo E.164 plausível
  return `${dd}${d}`;
}

// Chave canônica para casar conversas. Só o WhatsApp brasileiro tem o nono dígito volátil; para os
// demais países a chave é o número inteiro (DDI + local), sem inserir nada.
export function chaveTelefone(local: string, ddi: string = "55"): string | null {
  const t = normalizarTelefone(local, ddi);
  if (!t) return null;
  if (!t.startsWith("55")) return t; // não-BR: como está
  const resto = t.slice(2); // DDD + número local
  if (resto.length === 10) return `55${resto.slice(0, 2)}9${resto.slice(2)}`; // 12 díg (sem 9) → insere o 9
  return t; // 13 díg (já com o 9)
}
```

> **Cuidado com a compat:** um número dos EUA de 12–13 dígitos que por acaso comece com "55" NÃO deve ser
> tratado como BR. Por isso a compat exige `dd === "55"` — só dispara quando o DDI informado É o Brasil.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/tests/whatsapp/mensagem.test.ts`
Expected: PASS (os novos e os antigos).

- [ ] **Step 5: `typecheck` — pega os 6 chamadores?**

Run: `npm run typecheck`
Expected: **limpo** — o `ddi` tem default, então nenhum chamador de 1 argumento quebra. (As Tasks 4 e 5
adicionam o 2º argumento onde há DDI; sem elas, tudo ainda compila e roda como BR.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/whatsapp/mensagem.ts src/tests/whatsapp/mensagem.test.ts
git commit -m "feat(whatsapp): normalizarTelefone/chaveTelefone recebem o DDI (default 55)"
```

---

### Task 3: O cadastro — campo DDI

**Files:**
- Modify: `src/lib/validation/cliente.ts:28`
- Modify: `src/components/FormCliente.tsx:20-21, 209-211`
- Modify: `src/app/(app)/clientes/actions.ts` (função `lerEValidar`, ~62)

**Interfaces:**
- Consumes: a coluna `telefone_ddi` (Task 1).
- Produces: o form envia `telefone_ddi`; a action grava DDI normalizado (vazio → `"55"`).

- [ ] **Step 1: O schema aceita `telefone_ddi`**

Em `src/lib/validation/cliente.ts`, após a linha 28 (`telefone: z.string()...`):

```ts
    telefone: z.string().trim().max(30).optional(),
    telefone_ddi: z.string().trim().max(4).optional(),
```

- [ ] **Step 2: A action normaliza o DDI**

Em `src/app/(app)/clientes/actions.ts`, dentro de `lerEValidar` (após a linha que trata `cpf_cnpj`):

```ts
function lerEValidar(formData: FormData) {
  const dados = Object.fromEntries(formData) as Record<string, string>;
  if (dados.cpf_cnpj) dados.cpf_cnpj = dados.cpf_cnpj.replace(/\D/g, "");
  if (dados.email) dados.email = dados.email.trim();
  // DDI: só dígitos; vazio nunca vai ao banco — o Brasil é o default.
  dados.telefone_ddi = (dados.telefone_ddi ?? "").replace(/\D/g, "") || "55";
  return clienteSchema.safeParse(dados);
}
```

> O `insert`/`update` usam `limparVazios(parsed.data)` + spread, então `telefone_ddi` entra no payload
> automaticamente. Como nunca é vazio (o `|| "55"`), o `limparVazios` não o remove.

- [ ] **Step 3: O tipo do FormCliente**

Em `src/components/FormCliente.tsx`, no tipo do `cliente` (perto da linha 21, onde está `telefone?: string;`):

```tsx
  telefone?: string;
  telefone_ddi?: string;
```

- [ ] **Step 4: Os dois campos no form**

Substituir o `<FormCampo label="Telefone / WhatsApp" span={3}>` (linhas 209–211) por:

```tsx
          <FormCampo label="DDI" span={1}>
            <input
              name="telefone_ddi"
              inputMode="numeric"
              defaultValue={c.telefone_ddi ?? "55"}
              className={`${controleCls()} w-full`}
              aria-label="Código do país"
            />
          </FormCampo>
          <FormCampo label="Telefone / WhatsApp" span={2}>
            <input name="telefone" defaultValue={c.telefone ?? ""} className={`${controleCls()} w-full`} />
          </FormCampo>
```

> O span total continua **3** (DDI 1 + telefone 2). O grid é de 12 colunas; a linha tinha e-mail (5) +
> telefone (3) + responsável (4) = 12. Agora é 5 + 1 + 2 + 4 = 12. Confere.

- [ ] **Step 5: Confirmar que a ficha do cliente carrega `telefone_ddi`**

Achar onde a página passa o cliente ao `FormCliente` e garantir que o `select` inclui `telefone_ddi`:
```bash
grep -rn "telefone" src/app/\(app\)/clientes/\[id\]/page.tsx src/app/\(app\)/clientes/novo 2>/dev/null | grep select
```
Onde o select do cliente para edição não trouxer `telefone_ddi`, adicionar. (Se usar `select("*")`, já vem.)

- [ ] **Step 6: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(clientes): campo DDI no cadastro (default 55)"
```

---

### Task 4: Os 4 envios a cliente cadastrado

**Files:**
- Modify: `src/lib/comunicados/segmento.ts:14-20` (tipo `ClienteAlvo`)
- Modify: `src/app/(app)/comunicados/actions.ts:62, 70-83, 201`
- Modify: `src/app/(app)/nfse/lote/envio.ts:61` (+ o select do cliente)
- Modify: `src/app/(app)/financeiro/contas-a-receber/whatsapp.ts:16, 22`
- Modify: `src/lib/whatsapp/regua-motor.ts:130` (+ o select)

**Interfaces:**
- Consumes: `normalizarTelefone(local, ddi)` (Task 2), coluna `telefone_ddi` (Task 1).

- [ ] **Step 1: `ClienteAlvo` ganha `telefoneDdi`**

Em `src/lib/comunicados/segmento.ts`, no tipo (linha ~18):
```ts
  telefone: string | null;
  telefoneDdi: string | null;
```

- [ ] **Step 2: comunicados — select, map e envio**

`src/app/(app)/comunicados/actions.ts`:
- No select de `carregarAlvos` (linha 62), adicionar `telefone_ddi`:
  ```ts
  "id, razao_social, email, telefone, telefone_ddi, cpf_cnpj, regime_tributario, tipo_pessoa, status, endereco, contador_id, aceita_comunicados",
  ```
- No `.map` (linha ~74), após `telefone:`:
  ```ts
      telefone: (c.telefone as string | null) ?? null,
      telefoneDdi: (c.telefone_ddi as string | null) ?? null,
  ```
- No envio (linha 201):
  ```ts
      const tel = normalizarTelefone(c.telefone ?? "", c.telefoneDdi ?? "55");
  ```

- [ ] **Step 3: nfse/lote — select e envio**

`src/app/(app)/nfse/lote/envio.ts`:
- Achar o select que traz `cl.telefone` e adicionar `telefone_ddi`.
- Linha 61:
  ```ts
    const tel = normalizarTelefone(cl?.telefone ?? "", (cl?.telefone_ddi as string) ?? "55");
  ```

- [ ] **Step 4: contas-a-receber — select e envio**

`src/app/(app)/financeiro/contas-a-receber/whatsapp.ts`:
- Linha 16, no select: `clientes(razao_social, telefone, telefone_ddi)`.
- O tipo local (linha ~21) ganha `telefone_ddi?: string`.
- Linha 22:
  ```ts
    const tel = normalizarTelefone(cliente?.telefone ?? "", cliente?.telefone_ddi ?? "55");
  ```

- [ ] **Step 5: regua-motor — select e envio**

`src/lib/whatsapp/regua-motor.ts`:
- Achar o select que traz `cl.telefone` e adicionar `telefone_ddi`.
- Linha 130:
  ```ts
      telefone: normalizarTelefone(cl?.telefone ?? "", (cl?.telefone_ddi as string) ?? "55"),
  ```

- [ ] **Step 6: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde. Os testes de `regua`, `comunicados/segmento`, `notas-envio` cobrem o caminho BR e devem
continuar passando (o DDI cai em `"55"`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(whatsapp): os 4 envios a cliente cadastrado leem o telefone_ddi"
```

---

### Task 5: O atendimento e o webhook

**Files:**
- Modify: `src/app/(app)/atendimento/actions.ts:137, 203, 320` (os 3 casamentos com cliente) + seus selects
- Modify: `src/app/api/webhooks/zapi/[secret]/route.ts:49-50`

**Interfaces:**
- Consumes: `chaveTelefone(local, ddi)` (Task 2), coluna `telefone_ddi` (Task 1).

> **A linha 228 (`iniciarConversa`) NÃO muda** — o número vem do usuário no Inbox, sem DDI (fica no default
> `55`). A 69 e a 350 são para exibir nome, não para casar envio: também podem passar o DDI, mas o efeito é
> nulo para BR; **por consistência, atualizamos as que comparam telefone de cliente** (137, 203, 320).

- [ ] **Step 1: Os 3 casamentos no atendimento**

Em cada um dos três (linhas ~137, ~203, ~320), o select do cliente ganha `telefone_ddi` e a comparação passa
a concatenar. Exemplo da linha 137:
```ts
  const { data: cli } = await admin.from("clientes").select("id, telefone, telefone_ddi");
  const casados = (cli ?? []).filter(
    (c) => chaveTelefone((c.telefone as string) ?? "", (c.telefone_ddi as string) ?? "55") === telefone,
  );
```
Aplicar o mesmo às linhas ~203 (o select já lista campos — adicionar `telefone_ddi`) e ~320.

- [ ] **Step 2: O webhook**

`src/app/api/webhooks/zapi/[secret]/route.ts`:
- Linha 49, o select: `select("id, telefone, telefone_ddi")`.
- Linha 50, a comparação:
  ```ts
    const casados = (casadosRaw ?? []).filter(
      (c) => chaveTelefone((c.telefone as string) ?? "", (c.telefone_ddi as string) ?? "55") === tel,
    );
  ```
- A linha 45 (`chaveTelefone(msg.telefone)`) **não muda** — o número do webhook já vem completo com DDI, e
  `chaveTelefone` com o default `"55"` detecta BR pelo próprio prefixo e devolve os demais como estão.

- [ ] **Step 3: Verificar**

```bash
npm run typecheck && npm run lint && npx vitest run && npm run build
```
Expected: verde. Os testes de `inbox`, `zapi`, `atendimento/inbox-render` cobrem o casamento BR.

- [ ] **Step 4: Um teste que prova o casamento internacional**

Se `src/tests/whatsapp/zapi.test.ts` ou `inbox.test.ts` tiver um caso de casamento por telefone, acrescentar
um cliente com DDI ≠ 55 e provar que a mensagem casa. Se não houver harness para isso sem muito
andaime, registrar em `chaveTelefone` já cobre o núcleo (Task 2) — não inventar teste frágil só para ter um.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(atendimento): casamento de conversa usa o telefone_ddi do cliente"
```

---

### Task 6: Documentar e entregar

**Files:**
- Modify: `docs/DEPLOY.md` ou `docs/design/...` (onde couber a nota) — opcional
- Modify: `CHANGELOG.md`

- [ ] **Step 1: CHANGELOG — em `[Não lançado]`**

```markdown
### Adicionado

- **Telefone internacional (DDI no cadastro):** o envio de WhatsApp era hardcoded para o Brasil — o DDI
  `55` era chutado em qualquer número, e um telefone estrangeiro virava "55" + número inexistente. Agora o
  cadastro tem um campo **DDI** (padrão `+55`) antes do telefone, guardado na coluna nova `telefone_ddi`.
  `normalizarTelefone`/`chaveTelefone` recebem o país; o nono dígito brasileiro roda só quando DDI = 55.
  Todo cliente brasileiro segue idêntico (o default é `55`).

### Notas

- Normalização de dígitos específica de cada país (o "nono dígito" de outros países etc.) fica de fora —
  para os primeiros clientes internacionais, informar o número completo basta. Iniciar conversa **avulsa**
  com internacional pelo Inbox também exige digitar o número completo (o Inbox não tem campo de DDI).
```

- [ ] **Step 2: Verificação final**

```bash
npm run lint && npm run typecheck && npm test && npm run format && npm run build
npx prettier --check .
```

- [ ] **Step 3: PR**

```bash
git add -A
git commit -m "docs: registra o telefone internacional (DDI no cadastro)"
git push origin develop
gh pr create --base main --head develop --title "Telefone internacional: DDI no cadastro de clientes"
gh pr checks --watch
```

- [ ] **Step 4: A release, na ordem certa**

O merge **não** publica. Depois do merge: **Implantar** no EasyPanel → conferir o `/api/health` → e, se for
lançar versão, o bump de `package.json` + CHANGELOG vai **no mesmo PR** (o `versao.test.ts` exige que batam),
com a tag depois do health. Ver `docs/VERSIONAMENTO.md`.

> **Atenção — migration em produção.** Esta fatia adiciona coluna no banco. Antes de o EasyPanel servir o
> código novo, a coluna `telefone_ddi` precisa existir no banco de **produção**: rodar `npm run db:migrate`
> apontando `SUPABASE_DB_URL` ao projeto de produção (o Pedro faz — é credencial dele), OU aplicar a
> migration antes do deploy. Se o código novo subir e a coluna não existir, os selects que pedem
> `telefone_ddi` falham. **Coordenar com o Pedro no Step 3 do fluxo de release.**
