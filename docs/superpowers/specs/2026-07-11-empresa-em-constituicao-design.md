# Empresa em constituição — Design

**Data:** 2026-07-11
**Contexto:** Extensão do módulo Clientes + Legalização. Resolve o caso da **abertura de empresa nova**, que ainda não existe juridicamente (sem CNPJ) e portanto não pode ser um cliente comum.

## Problema

O processo de legalização vive na ficha do cliente (`legalizacao_processo.cliente_id`), mas uma empresa **em constituição** não tem cadastro: em `clientes`, `cpf_cnpj` é **obrigatório e único** e o status só tem `ativo`/`inativo`. Não há onde a abertura "morar" antes do CNPJ.

## Decisão (brainstorm)

**Cliente "em constituição" desde o início:** cadastra-se o cliente já no começo com um novo status `em_constituicao`, **sem CNPJ**; o processo de abertura roda normalmente na ficha; quando o CNPJ sai, preenche-se e o cliente vira `ativo`. Mantém tudo consistente (RLS por cliente, funil, obrigações/cobrança que **já** exigem `status = 'ativo'`).

### Achado que simplifica
As duas fontes de efeito colateral já filtram `status = 'ativo'` explicitamente:
- Obrigações: `src/lib/obrigacoes/motor.ts` → `.eq("status","ativo")`.
- Mensalidades: `gerar_mensalidades` (RPC) → `c.status = 'ativo'`.

Logo, um cliente `em_constituicao` **não gera obrigação nem mensalidade** sem nenhuma alteração nos geradores. A trilha de churn (trigger 0068) só reage a `inativo`↔`ativo`, então `em_constituicao`→`ativo` não dispara métrica espúria.

## Entrega em 2 fatias

- **Fatia 1 (esta):** o cliente `em_constituicao` — status + CNPJ opcional + criação (formulário manual enxuto) + início do processo de abertura + ativação. Resolve a exceção.
- **Fatia 2:** import do **PDF do formulário** de constituição — parser determinístico que pré-preenche o cadastro e a lista de sócios, anexa o PDF ao acervo e inicia a abertura.

---

## Fatia 1 — Cliente em constituição

### Modelo de dados (migration idempotente)

```sql
alter type status_cliente add value if not exists 'em_constituicao';

-- CNPJ deixa de ser obrigatório; exigido exceto quando em constituição.
alter table clientes alter column cpf_cnpj drop not null;
alter table clientes add constraint chk_cnpj_constituicao
  check (cpf_cnpj is not null or status = 'em_constituicao');

-- Sócios extraídos/informados (lista) — sem subsistema de quadro societário nesta fase.
alter table clientes add column if not exists socios jsonb;
```

- `cpf_cnpj` continua **unique** (múltiplos NULL são permitidos no Postgres).
- `regime_tributario` continua obrigatório e sob o `chk_tipo_regime` — a empresa nova é **PJ** e informa um **regime pretendido** (Simples/Presumido/Real, default Simples).
- Sem policy nova (herda as de `clientes`).

### Biblioteca
- **`src/lib/clientes/constituicao.ts`** (puro, testável):
  - `type SocioInput = { nome: string; cpf: string|null; nascimento: string|null; identidade: string|null; estadoCivil: string|null; endereco: string|null; telefone: string|null; email: string|null; participacao: string|null; papelSocietario: "administrador"|"quotista"|null }`.
  - `normalizarConstituicao(fd): DadosConstituicao | {erro}` — razão social obrigatória; regime válido; monta `endereco` e a lista `socios`; define `representante` = primeiro sócio administrador.
  - `validarAtivacao(cpfCnpj, regime): {erro?}` — CNPJ válido (via `validarDocumento("PJ",...)`).
- **Rótulo de status:** estender o helper de apresentação (`status_cliente` → "Em constituição") onde o status é exibido (lista/ficha).

### Ações — `src/app/(app)/clientes/constituicao-actions.ts`
- `criarEmpresaConstituicao(input): Promise<{ id?: string; erro?: string }>` — gate `podeCriarCliente`; insere `clientes` com `status='em_constituicao'`, `cpf_cnpj=null`, dados pretendidos + `socios` + `representante`; se `modeloAberturaId` informado, chama `iniciarProcesso(clienteId, modeloId, dataInicio)` (reusa a action de legalização) e retorna o id do **processo** para navegar ao detalhe.
- `ativarEmpresa(clienteId, { cpfCnpj, regime, inscricaoEstadual, inscricaoMunicipal }): Promise<{ ok?: boolean; erro?: string }>` — gate; valida CNPJ (formato + unicidade); `update clientes set cpf_cnpj, regime_tributario, inscricao_estadual, inscricao_municipal, status='ativo'`.

### Telas
- **"Nova empresa em constituição"** (`/clientes/nova-empresa`, botão na lista de Clientes ao lado de "Novo cliente"): formulário enxuto — razão social pretendida, nome fantasia, endereço, **regime pretendido**, contador responsável, **sócios** (lista dinâmica mínima: nome, CPF, %, administrador/quotista), observações; **modelo de abertura** (Simples/Presumido) + data de início. Botão "Criar e iniciar abertura" → cria o cliente e vai ao **detalhe do processo**. Sem consulta à Receita, sem exigir CNPJ.
- **Ficha do cliente:** quando `status='em_constituicao'`, mostra o selo **"Em constituição"** e um bloco **"Ativar empresa"** (CNPJ, regime, IE, IM → `ativarEmpresa`). O restante da ficha (legalização, documentos) funciona normalmente.
- **Lista de Clientes:** selo "Em constituição"; CNPJ nulo exibe "—".

### Testes (Fatia 1)
- **Unit** (`constituicao.test.ts`): `normalizarConstituicao` (razão social obrigatória; monta sócios; define representante = administrador; regime inválido rejeitado); `validarAtivacao` (CNPJ inválido rejeitado).
- **RLS** (`rls.test.sql`): admin cria cliente `em_constituicao` sem CNPJ (efeito); a constraint aceita CNPJ nulo só nesse status (inserir `ativo` sem CNPJ → falha).
- Suíte completa verde antes de cada commit.

## Fatia 2 — Import do PDF do formulário (esboço)

- **Dependência nova:** lib de extração de texto de PDF que aplica o `ToUnicode` (ex.: `unpdf`/`pdfjs`) — confirmado no PDF real que o texto é extraível e as respostas decodificam via ToUnicode.
- **`src/lib/clientes/parser-constituicao.ts`**: `extrairFormulario(texto): DadosConstituicao` — casa **pergunta → resposta** pelos rótulos do formulário Google (razão social, nome fantasia, endereço da empresa, capital social, atividades) e **repete** a seção de sócio (nome, CPF, nascimento, RG, estado civil, endereço, telefone, e-mail, %, administrador/quotista).
- **Tela:** na "Nova empresa em constituição", um **upload de PDF** → server action extrai o texto (a lib), roda o parser, e **pré-preenche** o formulário (editável). O usuário **revisa/corrige** antes de confirmar.
- Ao confirmar: cria o cliente `em_constituicao`, **anexa o PDF** ao acervo (bucket `documentos`, via a seção de documentos existente) e inicia a abertura.
- Rótulos-âncora do formulário (do exemplo real): "Qual será a Razão Social…", "Qual será o Nome de Fantasia…", "Qual será o endereço completo … da sua empresa?", "Qual vai ser o valor do capital social…", "Descreva quais serão as atividades…", "CPF do(a) sócio(a):", "Nome completo do(a) sócio(a):", "Data de nascimento:", "Número e órgão emissor do documento de identidade:", "Estado civil:", "Qual é o endereço completo … do(a) sócio(a)?", "Informe o telefone…", "Informe o e-mail…", "Esse sócio será apenas quotista ou também será administrador?", "Qual será o percentual de participação…", "A empresa terá mais de um(a) sócio(a)?".
- O formulário **não** pergunta o regime tributário → o modelo de abertura (Simples/Presumido) é escolhido na tela.

## Fora de escopo (futuro)
- Subsistema completo de quadro societário (tabela de sócios com vínculos) — hoje `socios jsonb` + `representante`.
- Write-back automático do CNPJ da etapa de legalização para o cadastro (hoje ativação manual).
- Extração por IA/OCR (a opção determinística foi a escolhida).

## Segurança
- CNPJ nulo permitido **apenas** em `em_constituicao` (constraint no banco, não só na app).
- Ativação valida CNPJ (formato + unicidade) antes de mudar o status.
- Sem alteração nas RLS de `clientes` nem nos geradores (que já exigem `ativo`).
