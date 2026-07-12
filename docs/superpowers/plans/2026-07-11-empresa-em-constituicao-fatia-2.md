# Empresa em constituição — Fatia 2 (anexar PDF) — Plano

> REQUIRED SUB-SKILL: superpowers:executing-plans.

**Decisão (revisada):** a extração automática foi **descartada**. Motivo: o produto é **whitelabel** (cada escritório tem seu próprio formulário) e o PDF do Google Forms exporta o texto **fora de ordem** — um parser determinístico só serviria a um formulário, e a única abordagem que generaliza (IA) exige chave, que o dono não quer vincular. Portanto a Fatia 2 entrega apenas: **anexar o PDF do formulário ao acervo** do cliente em constituição, com preenchimento manual (Fatia 1).

**Escopo:** upload opcional do PDF no formulário "Nova empresa em constituição" → ao criar, o PDF é anexado aos **Documentos** do cliente.

## Global Constraints
- Upload via `createAdminSupabase`; bucket privado `documentos`; validação PDF por magic bytes; ≤10 MB.
- Antes de commit: `npm run lint && npm run typecheck && npm test`.

---

### Task 1: Anexo do PDF na criação + campo no formulário

**Files:**
- Modify: `src/app/(app)/clientes/constituicao-actions.ts` (anexar PDF em `documentos`)
- Modify: `src/app/(app)/clientes/nova-empresa/FormConstituicao.tsx` (campo de upload + envio)

- [ ] **Step 1: Anexo em `criarEmpresaConstituicao`** — após criar o cliente, se houver um PDF válido no FormData, subir para `documentos` e registrar a linha (não aborta a criação se o anexo falhar).

```ts
import { createAdminSupabase } from "@/lib/supabase/admin";
// ... após obter clienteId (cliente criado com sucesso):
const pdf = formData.get("pdf");
if (pdf instanceof File && pdf.size > 0 && pdf.size <= 10 * 1024 * 1024) {
  const buf = new Uint8Array(await pdf.arrayBuffer());
  const ehPdf = buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  if (ehPdf) {
    const admin = createAdminSupabase();
    const caminho = `${clienteId}/${crypto.randomUUID()}-formulario-constituicao.pdf`;
    const up = await admin.storage.from("documentos").upload(caminho, buf, { contentType: "application/pdf" });
    if (!up.error) {
      await admin.from("documentos").insert({ cliente_id: clienteId, nome: "Formulário de constituição", tipo: "constituição", caminho_storage: caminho, enviado_por: perfil.id });
    }
  }
}
```

- [ ] **Step 2: Campo no `FormConstituicao`** — adicionar um input `type="file" accept="application/pdf"` (estado `pdfFile`), com um texto explicativo ("Anexe o PDF do formulário preenchido — fica no acervo do cliente"). No `enviar`, se `pdfFile`, `fd.set("pdf", pdfFile)`.

- [ ] **Step 3: Verificar** — `npm run lint && npm run typecheck && npm test`.
- [ ] **Step 4: Commit** — `feat: anexar PDF do formulário ao acervo do cliente em constituição`

---

### Task 2: Documentação

- [ ] **Step 1:** Em `docs/DOCUMENTACAO.md` (empresa em constituição): registrar que o **PDF do formulário** pode ser anexado ao acervo do cliente na criação. Nota: a **extração automática** foi descartada por ora — em whitelabel, cada escritório tem um formulário próprio e o PDF do Google Forms embaralha a ordem do texto; a única via que generaliza (IA) exige chave, adiada.
- [ ] **Step 2: Commit** — `docs: anexo do PDF do formulário de constituição`

---

## Self-Review
- Upload + anexo ao acervo → T1. ✔
- Docs (com a decisão registrada) → T2. ✔
- Sem dependência nova, sem chave, sem parser — whitelabel-limpo.
