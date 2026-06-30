# V3 — Geração automática do contrato de prestação de serviços contábeis

> **Status:** design aprovado para implementação · **Data:** 2026-06-30 · **Marco:** V3 do [ROADMAP](../../../ROADMAP.md)

## 1. Contexto e objetivo

Com o cadastro alimentado pela V2 (razão social, CNPJ, regime, endereço, honorário), a V3 gera o
**contrato de prestação de serviços contábeis** de cada cliente preenchendo automaticamente a minuta
padrão do escritório e produzindo os arquivos em **Word e PDF**, salvos nos Documentos do cliente.

A minuta real do escritório (`minuta contrato padrão.docx`) foi analisada: é um contrato completo
(objeto, obrigações, honorários, vigência, rescisão, LGPD, foro). Os pontos a personalizar foram
mapeados (§4). O escritório (CONTRATADA) já está escrito na minuta e correto — a V3 personaliza
apenas os dados da CONTRATANTE e alguns valores dinâmicos.

## 2. Escopo

**Dentro da V3:**

- **Campos de representante legal** no cadastro do cliente (faltam para o contrato).
- **Motor de geração:** preenche a minuta tagueada com os dados do cliente → `.docx` → PDF.
- Geração a partir da **ficha do cliente**, salvando Word + PDF nos **Documentos** (módulo da V1) e
  oferecendo download.
- **Vigência dinâmica** (data escolhida ao gerar; default hoje).

**Fora da V3 (consciente):**

- **Assinatura digital** — é a V4 (a V3 entrega os arquivos prontos para assinar).
- **Múltiplos modelos de contrato / upload de template pelo usuário** — a V3 usa uma minuta única
  versionada no repositório; templates por escritório entram na V7 (whitelabel).
- **Config de dados do escritório (CONTRATADA)** — ficam fixos na minuta na V3.

## 3. Decisões tomadas no brainstorming

- Modelo: o escritório **já tem** o `.docx`; tagueamos os campos juntos (não redigir do zero).
- Representante legal: **adicionar campos ao cadastro** (contrato sai 100% preenchido; prepara V4).
- Saída: **Word + PDF** (PDF via LibreOffice headless).
- Destino: **salvar nos Documentos do cliente + baixar**.
- Valores fixos: **vigência dinâmica**, **vencimento mantém "dia 3"** como na minuta.

## 4. Mapa de placeholders (minuta → tags)

A minuta é convertida (uma vez) para a sintaxe de tags do docxtemplater. Placeholders encontrados e
seu destino:

| Na minuta | Tag | Fonte |
|---|---|---|
| `[RAZÃO SOCIAL]`, `[RAZÃO SOCIAL DA CONTRATANTE]` | `{razao_social}` | `clientes.razao_social` |
| CNPJ da CONTRATANTE `[___]` | `{cnpj}` | `cpf_cnpj` (formatado `00.000.000/0000-00`) |
| `[endereço completo]` | `{endereco}` | `endereco` jsonb, composto em uma linha |
| CEP `[___]` | `{cep}` | `endereco.cep` (formatado `00000-000`) |
| e-mail `[___]` (CONTRATANTE) | `{email}` | `email` |
| telefone `[___]` | `{telefone}` | `telefone` |
| `[NOME DO REPRESENTANTE]` | `{rep_nome}` | `responsavel_nome` |
| `[nacionalidade]` | `{rep_nacionalidade}` | `representante.nacionalidade` |
| `[estado civil]` | `{rep_estado_civil}` | `representante.estado_civil` |
| `[profissão]` | `{rep_profissao}` | `representante.profissao` |
| RG `[___]` (representante) | `{rep_rg}` | `representante.rg` |
| CPF `[___]` (representante) | `{rep_cpf}` | `representante.cpf` (formatado) |
| `R$ [___]` | `{honorario}` | `clientes_financeiro.honorario_mensal` (`R$ x.xxx,xx`) |
| `[valor por extenso]` | `{honorario_extenso}` | derivado do honorário (lib `extenso`) |
| vigência `01/07/2026` | `{vigencia_inicio}` | data escolhida ao gerar (DD/MM/AAAA) |
| e-mail da CONTRATADA `[___]` | constante no template | e-mail do escritório (preenchido na minuta) |
| `[31 de janeiro]` (inventário) | mantido como texto fixo | — |

O template tagueado é salvo em `templates/contrato-prestacao-servicos.docx` (versionado).

## 5. Modelo de dados

**`0017_clientes_representante.sql`** (idempotente): `alter table clientes add column if not exists
representante jsonb`. Conteúdo: `{ nacionalidade, estado_civil, profissao, rg, cpf }`. O **nome** do
representante reaproveita o `responsavel_nome` já existente. RLS: **herda a de `clientes`** (edição
cadastral: admin/assistente e contador-dono). Sem dado financeiro — o documento (RG/CPF) é dado
pessoal comum, não restrito como honorário.

## 6. Arquitetura

```
cliente + honorário + vigência ─► montarDadosContrato() ─► gerarDocx() ─► converterPdf() ─► salvar Documentos + download
       (dados do CRM)              (mapa tag→valor puro)    (docxtemplater)   (Gotenberg HTTP)        (módulo V1)
```

Camada de geração isolada e testável:

- **`src/lib/contrato/dados.ts`** — `montarDadosContrato(cliente, honorarioMensal, vigenciaInicio):
  Record<string, string>`. **Função pura**: mapeia e formata cada tag (CNPJ/CPF/CEP mascarados,
  endereço composto, honorário `R$`, valor por extenso via `extenso`, data DD/MM/AAAA). Campos
  ausentes viram string vazia.
- **`src/lib/contrato/extenso.ts`** — wrapper fino sobre a lib `extenso` para "reais por extenso".
- **`src/lib/contrato/gerar.ts`** — `gerarDocx(dados): Buffer` (docxtemplater + template) e
  `converterPdf(docx: Buffer): Promise<Buffer>` (POST multipart ao Gotenberg
  `/forms/libreoffice/convert`, URL em `GOTENBERG_URL`).
- **Decisões técnicas:** docxtemplater (preserva formatação; resolve fragmentação de runs do Word);
  Gotenberg como serviço Docker dedicado (LibreOffice via HTTP) — mantém a imagem do app enxuta e os
  dados pessoais dentro da infraestrutura (LGPD). Adicionar Gotenberg como serviço no EasyPanel e a
  variável `GOTENBERG_URL`.

## 7. Fluxo e UI

- Na ficha do cliente (`/clientes/[id]`), seção **"Gerar contrato"** com campo de **data de início
  da vigência** (default hoje) e botão **Gerar**.
- **Quem vê:** o contrato contém o honorário (dado financeiro) → visível a **admin / financeiro /
  contador-dono** (mesma regra de leitura de `clientes_financeiro`). Assistente não gera.
- **Pré-checagem:** antes de gerar, lista os campos necessários ausentes (representante completo,
  honorário, endereço). O usuário decide gerar mesmo assim (tags vazias) ou completar antes.
- Ao gerar: server action `gerarContrato(clienteId, vigenciaInicio)` carrega cliente + honorário,
  monta os dados, gera `.docx`, converte PDF, **salva ambos nos Documentos do cliente** (Storage +
  tabela `documentos` + log de auditoria da V1) e retorna os links de download.

## 8. Tratamento de erros e casos de borda

- **Dados faltando:** a pré-checagem lista o que falta; geração com tags vazias é permitida (decisão
  do usuário), não bloqueada silenciosamente.
- **Gotenberg indisponível / falha na conversão:** entrega o **`.docx` mesmo assim** + aviso "PDF não
  gerado"; o trabalho não se perde.
- **Template ausente/inválido:** erro claro ("modelo de contrato indisponível").
- **Honorário ausente:** contrato gerado com o campo de valor vazio + aviso na pré-checagem.
- **LGPD:** arquivos vão para os Documentos do cliente (RLS da V1); arquivos temporários da conversão
  são apagados.

## 9. Testes (TDD)

- **`montarDadosContrato` (unitário):** cada tag; máscara de CNPJ/CPF/CEP; composição do endereço;
  formatação do honorário; **valor por extenso** (vários valores, incluindo centavos e zero);
  data; campos ausentes → string vazia.
- **`extenso` (unitário):** reais por extenso para valores representativos.
- **`gerarDocx` (unitário):** preenche um **template-fixture pequeno** (não a minuta real) e confere,
  descompactando o `.docx`, que o texto contém os valores.
- **`converterPdf` (unitário):** chamada HTTP ao Gotenberg **mockada**; conversão real verificada na
  E2E.
- **Pré-checagem de campos:** cenários completo / faltando representante / faltando honorário.
- **E2E manual:** gerar o contrato de um cliente real → Word + PDF nos Documentos, conteúdo correto.

## 10. Evoluções futuras (fora da V3)

- **V4 — Assinatura digital:** enviar o PDF gerado para a plataforma de assinatura.
- **V7 — Whitelabel:** template e dados da CONTRATADA por escritório (upload da própria minuta;
  config de escritório multi-tenant).
- Múltiplos modelos de contrato e cláusulas opcionais condicionais.

## 11. Decisões em aberto / riscos

- **Lib de valor por extenso:** `extenso` (npm) cobre reais; validar com alguns valores antes de
  fixar. Risco baixo.
- **Tagueamento da minuta:** passo manual único (substituir `[___]` ambíguos por tags nomeadas pelo
  contexto). Validado com o usuário antes de versionar o template.
- **Gotenberg no EasyPanel:** novo serviço a provisionar; enquanto não estiver no ar, a geração
  entrega só o `.docx` (degradação graciosa).
