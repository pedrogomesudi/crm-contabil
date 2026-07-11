# Proposta com modelo — Design (Sub-projeto B)

**Data:** 2026-07-11
**Contexto:** Módulo Comercial. Depende do sub-projeto A (Marca do escritório — `escritorio_config`, entregue v5.11.0).

## Objetivo

Permitir que a proposta comercial seja gerada a partir de **um modelo**: o **modelo padrão** da plataforma (whitelabel, alimentado pela Marca) ou um **modelo próprio** enviado pelo escritório (design pronto com tags substituíveis, ex.: ELEVARE Advisory). O resultado é um **PDF gerado sob demanda e baixado** — nada é persistido.

## Motivação e achados

A proposta já tem dados (`proposta` + `proposta_item`) e **já existe** uma tela de documento HTML (`DocumentoProposta.tsx`) com botão Imprimir. Já existe o **motor .docx** dos contratos (`gerarDocx` com docxtemplater + `converterPdf` via Gotenberg). Faltam duas coisas: **(1)** ligar a Marca ao documento padrão; **(2)** deixar o escritório subir o próprio modelo com tags.

Ao dissecar o modelo real da ELEVARE (arquivo HTML empacotado React, ~458 KB), concluímos:

- O conteúdo empacotado **já é HTML estático pré-renderizado** — todas as seções, a tabela de preços e os placeholders estão como marcação de texto; o React apenas hidrata a interatividade. "Achatar" = extrair o template, embutir imagens como data URI e **remover os scripts React**.
- Apenas **5 campos são variáveis**, marcados com `〔 … 〕`: Nome do Cliente, Mês/Ano, Nome do responsável, e-mail, telefone. **Preços e condições são texto fixo** no arquivo ("Ajuste os valores conforme a negociação" — editados à mão). Ou seja, o modelo próprio é **design + poucas tags**, e **não** uma tabela dirigida pelos itens do banco.

## Decisões (fechadas no brainstorm)

1. **Seleção no nível do escritório.** Uma configuração única define `padrao` ou `proprio` para todas as propostas.
2. **Formatos do modelo próprio:** `.docx` e **HTML estático**.
3. **PDF gerado na hora e baixado.** Nada persiste; a proposta já tem `numero` para identificar.
4. **Modelo próprio = design + poucas tags.** Itens/totais do banco só alimentam o modelo **padrão**. O bloco `{#itens}` é **suportado mas opcional** no modelo próprio (a ELEVARE não usa).
5. **HTML deve ser estático achatado** (marcação + CSS inline + assets em data URI), tags no formato `{tag}`, renderizado pelo Gotenberg/Chromium com **JS desligado e sem rede externa**. Injeção de tag por replace determinístico. A implementação achata o bundle React da ELEVARE.
6. **Responsável comercial = 3 campos na própria proposta** (`nome`, `email`, `telefone`); nome/e-mail pré-preenchem do usuário logado, telefone é digitado.

## Catálogo de tags

Formato `{tag}` — **idêntico em .docx e HTML** (docxtemplater usa `{}` por padrão; no HTML fazemos o mesmo replace). Tags ausentes viram string vazia.

| Grupo | Tag | Origem |
|---|---|---|
| Escritório (Marca) | `{nome_escritorio}` | `escritorio_config.nome` |
| | `{cnpj_escritorio}` | `escritorio_config.cnpj` (formatado) |
| | `{email_escritorio}` | `escritorio_config.email` |
| | `{telefone_escritorio}` | `escritorio_config.telefone` |
| | `{endereco_escritorio}` | `escritorio_config.endereco` (linha única) |
| Cliente | `{nome_cliente}` | `oportunidade.prospect_nome` |
| | `{contato_cliente}` | `oportunidade.contato_nome` |
| Proposta | `{numero_proposta}` | `proposta.numero` |
| | `{data_emissao}` | data de geração (dd/mm/aaaa) |
| | `{mes_ano}` | mês/ano da geração (ex.: "Julho/2026") |
| | `{validade}` | `proposta.validade` (dd/mm/aaaa ou vazio) |
| | `{condicoes}` | `proposta.observacoes` |
| Responsável | `{responsavel_nome}` | `proposta.responsavel_nome` |
| | `{responsavel_email}` | `proposta.responsavel_email` |
| | `{responsavel_telefone}` | `proposta.responsavel_telefone` |
| Totais | `{total_mensal}` | soma dos itens mensais (BRL) |
| | `{total_unico}` | soma dos itens únicos (BRL) |
| Itens (loop, opcional) | `{#itens}…{/itens}` com `{descricao}` `{recorrencia}` `{valor}` | `proposta_item` |

Valores monetários formatados em BRL; datas em pt-BR. Todo o cálculo de data/mês é **server-side** (as páginas são server components — respeita a regra `react-hooks/purity`).

## Modelo de dados (migration nova, idempotente)

`escritorio_config` (singleton id=1) ganha:
- `proposta_modelo text not null default 'padrao'` com `check (proposta_modelo in ('padrao','proprio'))`
- `proposta_template_path text`
- `proposta_template_tipo text check (proposta_template_tipo in ('docx','html'))`

`proposta` ganha (todas nullable):
- `responsavel_nome text`
- `responsavel_email text`
- `responsavel_telefone text`

RLS: as colunas herdam as policies já existentes (`escritorio_config` admin-write / all-read; `proposta_rw` para admin/assistente/contador). Sem policy nova.

Template guardado no bucket privado `documentos` em `marca/proposta-template.{docx|html}` (upload via service_role, leitura via URL assinada — mesmo padrão do logo).

## Componentes e arquivos

### Motor de tags
- **`src/lib/comercial/proposta-template.ts`** (novo, testável, funções puras):
  - `montarMapaTags(dados): Record<string,string>` — recebe proposta + marca + pagamento + responsável + data e devolve o mapa `tag→valor` (e a lista `itens` para o loop docx).
  - `TAGS_DISPONIVEIS: {tag, rotulo, grupo}[]` — fonte única do catálogo, usada no painel de referência, no modelo de exemplo e na validação.
  - `tagsNoTexto(texto): string[]` — extrai `{...}` de um texto (para validação de HTML).
  - `formatarEnderecoLinha`, `formatarBRL`, `formatarMesAno` — helpers.

### Geração
- **`src/lib/comercial/gerar-proposta.ts`** (novo):
  - `.docx`: reusa `gerarDocx(template, mapa)` + `converterPdf(docx)`.
  - HTML: `renderHtml(template, mapa)` faz o replace determinístico das tags e do bloco `{#itens}` (implementação mustache-mínima só para o loop conhecido), depois `converterPdfHtml(html)`.
- **`src/lib/contrato/gerar.ts`**: adicionar `converterPdfHtml(html: string): Promise<Buffer|null>` — Gotenberg `/forms/chromium/convert/html`, com flags que **desativam JS** e **bloqueiam rede externa**; mesma degradação graciosa (timeout + `null`) do `converterPdf`.

### Configuração (admin) — em Configurações → Marca (nova seção "Proposta")
- Rádio **Modelo padrão / Modelo próprio**.
- Upload do arquivo (`.docx` ou `.html`), com validação (abaixo).
- **Painel de referência de tags** (lista de `TAGS_DISPONIVEIS`).
- **Download de modelo de exemplo** (`.docx` e `.html` com todas as tags) — gerado a partir de `TAGS_DISPONIVEIS`.
- Actions em **`src/app/(app)/configuracoes/marca/proposta-actions.ts`**:
  - `salvarModeloProposta` (define padrão/próprio).
  - `enviarTemplateProposta` (valida, faz upload, grava `template_path`/`tipo`, remove o anterior — mesmo rollback do logo).
  - `baixarExemplo(tipo)`.

### Validação do upload
- **`.docx`:** magic bytes de ZIP (`50 4B 03 04`); carregar com `PizZip`/docxtemplater e listar as tags; falha ⇒ "arquivo .docx inválido".
- **HTML:** deve ser texto (não-binário); **sanitizar** (remover `<script>`, handlers `on*`, `javascript:`); detectar tags reconhecidas × desconhecidas via `tagsNoTexto`; **avisar** se houver recursos externos (`src=`/`href=`/`url()` apontando para `http(s)://`) — orientar a embutir como data URI. A renderização final é sempre com JS desligado.
- O resultado da validação (tags encontradas, desconhecidas, avisos) é mostrado ao admin; tags desconhecidas **não bloqueiam** (viram vazio), recursos externos **avisam** mas não bloqueiam.

### Modelo padrão (ligar a Marca)
- **`DocumentoProposta.tsx`**: cabeçalho passa a usar a Marca — `{nome_escritorio}`, `{cnpj_escritorio}`, `{endereco_escritorio}` e o **logo** (URL assinada) — em vez do `pagamento.titular`. Mantém a tabela de itens, totais, condições e dados de pagamento. O botão Imprimir continua gerando o PDF pelo navegador.
- A página do documento (`[id]/documento/page.tsx`) carrega a Marca e passa ao componente.

### Geração a partir do modelo próprio
- Na tela da proposta (`EditorProposta` / `[id]/page.tsx`): os **3 campos do responsável** (pré-preenchidos do usuário logado) e um botão **"Gerar documento"**.
- Se `proposta_modelo = padrao` → navega para `/documento` (fluxo atual, Imprimir).
- Se `proposta_modelo = proprio` → server action `gerarDocumentoProposta(id)` monta o mapa, gera o PDF (docx ou html), e devolve para **download** (`proposta-<numero>.pdf`). Se o Gotenberg estiver indisponível (retorno `null`), mensagem clara ("conversão para PDF indisponível; tente novamente").

### Semente ELEVARE
- Script de implementação (`scripts/achatar-elevare.mjs`, JS puro) que lê o bundle, extrai o `__bundler/template`, resolve os UUIDs de assets para data URI a partir do `__bundler/manifest`, **remove os scripts** e troca `〔 … 〕` pelas tags. Saída: **`templates/proposta-elevare.html`** (estático, com `{tags}`) — modelo próprio pronto para a ELEVARE.

## Fluxo de geração (modelo próprio)

```
Proposta #123 → Gerar documento
  ↓ obterProposta(123) + obterMarca() + pagamento + responsável
  ↓ montarMapaTags(...) → { nome_cliente: "...", mes_ano: "Julho/2026", ..., itens: [...] }
  ↓ tipo == 'docx' → gerarDocx(template, mapa) → converterPdf(docx)
  ↓ tipo == 'html' → renderHtml(template, mapa) → converterPdfHtml(html)   (JS off, sem rede)
  ↓ download proposta-123.pdf
```

## Testes

- **`proposta-template.test.ts`**: `montarMapaTags` (mapeia todos os grupos; nulos viram vazio; BRL e datas corretos; lista de itens), `tagsNoTexto` (extrai `{...}`, ignora `{#itens}`/`{/itens}` como controle), `formatarMesAno`/`formatarEnderecoLinha`.
- **`gerar-proposta.test.ts`**: `renderHtml` (substitui tags, expande `{#itens}`, remove `<script>`/`on*`/`javascript:`), validação (docx inválido rejeitado; HTML com recurso externo gera aviso; tags desconhecidas listadas).
- **RLS** (`rls.test.sql`): admin grava `proposta_modelo`/`template_path`; financeiro lê a config mas não altera (já coberto para a tabela; adicionar assert das colunas novas). `proposta` responsável: admin/contador escrevem, financeiro não vê proposta (herdado).
- Suíte completa (`npm test`, `npm run db:test`, `lint`, `typecheck`) verde antes de cada commit.

## Fora de escopo (YAGNI)

- Persistir/versionar PDFs gerados (decidido: gerar na hora).
- Escolha de modelo por proposta (decidido: nível do escritório).
- Editor visual de template / WYSIWYG.
- Suporte a modelos por-cliente ou por-tipo de proposta.
- Multi-tenant real (a config vira por-tenant quando a V9 chegar — a estrutura já antecipa).

## Segurança (preservar)

- Template no bucket **privado** `documentos`, leitura por URL assinada; upload por service_role.
- HTML **sanitizado** (sem `<script>`/`on*`/`javascript:`) e renderizado com **JS desligado, sem rede externa** — não executamos JS de terceiros.
- Validação de `.docx` por magic bytes + parse; extensão é forjável.
- Sem dados fiscais reais no repositório; a semente ELEVARE em `templates/` não contém dados de cliente (só o design com tags).
