# V2 — Integração Domínio → CRM (importação de cadastro, regime e honorários)

> **Status:** design aprovado para implementação · **Data:** 2026-06-26 · **Marco:** V2 do [ROADMAP](../../../ROADMAP.md)

## 1. Contexto e objetivo

O CRM (V1) já tem cadastro de clientes, papéis/RLS e dashboard. A V2 traz, **do Domínio para o
CRM**, os dados cadastrais, de regime tributário e de honorários dos clientes, para que o CRM seja
a tela única que consome essas informações e alimente as versões seguintes (V3 contrato, V5 NFS-e).

A descoberta de viabilidade (registrada abaixo) descartou os caminhos de **API oficial** (fluxo
invertido — só recebe documentos fiscais, não extrai cadastro), **RPA** (frágil, risco de ToS,
ruim para comercializar) e **leitura direta do banco** (proprietário, indisponível no Domínio Web,
maior passivo jurídico). O caminho escolhido é **exportar relatórios do Domínio e importá-los no
CRM** — sancionado, robusto e que escala para a comercialização (V7), pois todo escritório consegue
exportar do próprio Domínio.

## 2. Escopo

**Dentro da V2:**

- Importar **cadastro de empresas** (entidade-mestra), **regime tributário preciso**, **status** e
  **CNAE** a partir do export *Relação de Regime de Empresas*.
- Enriquecer com **endereço e contato** a partir do export *Clientes* (módulo Honorários).
- Importar **contratos/honorários** a partir do export *Relação de Contratos*.
- Tela de importação no CRM com **upload manual**, **prévia (dry-run)** e **confirmação**.
- **Auditoria** de cada importação e **pendências** para casos que exigem revisão manual.
- Arquitetura com **fonte de dados abstrata**, pronta para evoluir para pasta automática/API sem
  retrabalho.

**Fora da V2 (consciente):**

- **Faturamento próprio do cliente** (receita declarada na Escrita Fiscal) — entra na V5 (NFS-e)
  como fonte adicional.
- **Automação total** (geração agendada via módulo *Processos / Rotinas Automáticas*) — a
  arquitetura fica pronta; a validação hands-on e o modo desassistido ficam para etapa seguinte.
- **Escrita/volta de dados para o Domínio** — a integração é unidirecional (Domínio → CRM).

## 3. Fontes de dados (validadas com arquivos reais do escritório)

Os três exports são `.xls` BIFF8 do Domínio com **offsets de planilha quebrados** (bibliotecas
padrão como xlrd/pandas falham). Foi validado um leitor BIFF tolerante (varre registros
linearmente, lê a SST e as células). Contagens reais observadas:

| Export | Layout | Registros | Papel no modelo |
|---|---|---|---|
| **Relação de Regime de Empresas** | Tabular | 123 empresas | **Mestra**: CNPJ, razão social, regime, status, CNAE, IE |
| **Clientes** (Honorários) | Ficha (1 por página) | 87 fichas (81 c/ CNPJ) | Enriquece: endereço, contato; vínculo p/ contratos |
| **Relação de Contratos** | Tabular | 74 contratos | Honorário: tipo, datas, valores |

**Particularidades confirmadas:**

- Datas vêm como **número serial do Excel** (ex.: `45931` → `2025-10-01`); base 1899-12-30.
- Texto em **latin-1**; valores monetários com vírgula decimal.
- No export *Clientes*, o documento do cliente está no campo **"Inscrição"** (14 díg = CNPJ),
  **não** em "C.N.P.J." (que é o do escritório, no cabeçalho repetido por página).
- A coluna "Regime Tributário" de *Empresas* distingue: Microempresa (78), Lucro Presumido (30),
  Lucro Real (11), Imune do IRPJ (3), Isenta do IRPJ (1).
- Status: Ativa (119), Inativa (3), Ativa - Sem movimento (1).
- Inscrição Estadual preenchida em apenas 3 de 123 (maioria são empresas de serviço sem IE).

## 4. Identidade e linkagem

**Chave universal de junção entre as três fontes e o CRM: o CNPJ/CPF** (`clientes.cpf_cnpj`,
único). Linkagem observada nos dados:

- Empresas ∩ Clientes (por CNPJ) = 75; só em Empresas = 47; só em Clientes = 6.
- Contratos → Cliente (por código do Honorários) = 74/74, **0 órfãos**.

**Modelo:**

- A **Empresa** (do *Regime de Empresas*) é a entidade primária → um registro em `clientes` por CNPJ.
- O **Cliente do Honorários** acrescenta endereço/contato (junção por CNPJ). Os 47 sem
  correspondência ficam com cadastro parcial (sem contato); os 6 clientes-PF sem empresa viram
  **pendências** (avaliar importar como PF).
- O **Contrato** liga-se ao cliente via `código do Honorários → CNPJ`. Guarda-se o
  `dominio_codigo` (código do Honorários) em `clientes` como vínculo estável secundário.

## 5. Mapeamento de campos

| Campo no CRM (`clientes`) | Origem | Observação |
|---|---|---|
| `cpf_cnpj` | Empresas.CNPJ (ou Clientes.Inscrição) | Normalizado (só dígitos). Chave de junção. |
| `razao_social` | Empresas.Empresa (ou Clientes.Nome) | |
| `nome_fantasia` | Clientes.Apelido | Quando houver. |
| `regime_tributario` | Empresas."Regime Tributário" | Microempresa→`Simples`; Lucro Presumido→`Presumido`; Lucro Real→`Real`; Imune/Isenta→**pendência**. |
| `tipo_pessoa` | derivado do documento | 14 díg→`PJ`; 11 díg→`PF`. MEI só se o Domínio indicar. CHECK tipo×regime respeitado. |
| `status` | Empresas.Status | Ativa→`ativo`; Inativa→`inativo`; "Ativa - Sem movimento"→`ativo`. |
| `cnae` *(coluna nova)* | Empresas."CNAE Principal" | Útil para V3/V5. |
| `inscricao_estadual` | Empresas."Inscrição Estadual" | Maioria nula. |
| `inscricao_municipal` | — | Não disponível nestes exports (fica nulo). |
| `endereco` (jsonb) | Clientes (Endereço/Número/Complemento/Bairro/Município/UF/CEP/País) | Composto. |
| `email`, `telefone` | Clientes (E-mail; Telefone/Celular) | |
| `dominio_codigo` *(coluna nova)* | Clientes.Código | Vínculo p/ contratos. |
| `origem` *(coluna nova)* | constante `'dominio'` | Distingue de cadastros manuais. |
| `sincronizado_em` *(coluna nova)* | timestamp do import | |
| `dominio_snapshot` *(coluna nova, jsonb)* | últimos valores importados | Habilita merge inteligente futuro. |

**Contrato (`contratos_dominio`):** `tipo_contrato`, `emissao`, `inicio_contrato`,
`inicio_faturamento`, `dia_vencimento`, `mes_vencimento`, `encerrado_em`, `valor_original`,
`valor_atual`, `quantidade`. O `clientes_financeiro.honorario` recebe a **soma do `valor_atual` dos
contratos ativos** (`encerrado_em` nulo) do tipo "HONORARIOS CONTABEIS"; contratos encerrados ou de
outros tipos ficam guardados em `contratos_dominio`, mas não entram no honorário.

## 6. Arquitetura

Princípio: **isolar "de onde vêm os dados" de "como gravamos no CRM".**

```
[Export Domínio .xls/.csv] ─► Parser ─► Registros normalizados ─► Reconciliação ─► Prévia ─► Aplicar (upsert)
[Futuro: pasta auto / API] ──────────(mesma fronteira FonteDominio)──────────────────┘            │
                                                                                       Auditoria (importacoes)
```

- **Fronteira `FonteDominio`** (interface): hoje `FonteArquivo` (upload + parse). Amanhã,
  `FontePastaAutomatica` ou `FonteApi` entram sem mexer no resto.
- **Parser isolado e testável.** Estratégia em ordem de preferência:
  1. Investigar export **CSV/TXT / "Conjunto de Dados"** do Domínio (mais estável — preferido).
  2. **SheetJS** (Node) — mais tolerante que xlrd; pode ler o `.xls` direto.
  3. **Leitor BIFF tolerante** portado (algoritmo já validado em Python) como fallback garantido.
  A escolha de formato fica encapsulada no parser; não vaza para o resto.
- **Reconciliação:** casa por CNPJ; classifica cada registro em **novos / atualizados / conflitos /
  inalterados / erros**. Regra: **Domínio é fonte da verdade** para os campos que fornece; campos
  só-do-CRM ficam intactos. Idempotente (reimportar = zero mudança).
- **Staging:** a prévia é persistida em `importacao_itens` (RLS + expiração), não em memória, para
  suportar volumes (centenas/milhares de linhas) e o passo prévia→confirmar.

## 7. Modelo de dados (migrations idempotentes, runner próprio)

Seguindo `AGENTS.md` (migrations imutáveis após aplicadas; novas migrations idempotentes; RLS por
papel; honorário isolado de `assistente`):

**`0012_clientes_origem_dominio.sql`** — `alter table clientes add column if not exists`:
`origem text not null default 'manual'`, `dominio_codigo text`, `cnae text`,
`sincronizado_em timestamptz`, `dominio_snapshot jsonb`. Índice único parcial em `dominio_codigo`
(where not null). Sem novas policies (herda as de `clientes`).

**`0013_contratos_dominio.sql`** — tabela `contratos_dominio` (FK `cliente_id`, campos do §5).
**RLS idêntica à de `clientes_financeiro`** (admin/financeiro/contador-dono; **assistente sem
acesso**, pois há valores).

**`0014_importacoes.sql`** — `importacoes` (id, `tipo`, `arquivo_nome`, `executado_por`,
`executado_em`, `status`, contadores `novos/atualizados/erros/inalterados/pendencias`) e
`importacao_itens` (staging da prévia, FK `importacao_id`, `payload jsonb`, `classe`, `expira_em`).
RLS: admin/assistente leem cadastrais; itens com valor seguem a regra do financeiro. Rotina de
limpeza de prévias expiradas.

## 8. Fluxo e UI

Tela **`/integracoes/dominio`** (menu lateral; visível a admin/assistente):

1. **Upload** — arrasta um ou mais dos três exports; o sistema detecta qual é qual pelo conteúdo.
2. **Prévia (dry-run)** — abas: 🟢 Novos · 🟡 Atualizados (campo a campo) · 🔴 Conflitos · ⚪
   Inalterados · ⚠️ Erros · 🟣 Pendências (Imune/Isenta, PF-sem-empresa, sem-documento).
3. **Confirmar** — "Aplicar": upsert **tudo-ou-nada** (transação); registra `importacoes`.
4. **Histórico** — importações anteriores com contadores e status.

O mesmo motor de reconciliação serve depois ao modo automático (sem tela, aplicando por regra).

## 9. Tratamento de erros e casos de borda

- **Arquivo inválido/desconhecido:** falha clara (qual arquivo/seção), **sem aplicação parcial**.
- **Linhas inválidas** (CNPJ inválido, campo obrigatório vazio): vão para ⚠️ Erros; o resto segue.
  Reaproveita a validação de CPF/CNPJ da V1.
- **Pendências** (não bloqueiam): regime Imune/Isenta (4); clientes-PF sem empresa (6);
  fichas sem documento — `cpf_cnpj` é `NOT NULL UNIQUE` (5 eventuais).
- **Conflito de identidade:** mesmo CNPJ com `dominio_codigo` divergente → conflito, nunca resolvido
  às cegas.
- **Datas seriais, latin-1, vírgula decimal, cabeçalho de página repetido:** tratados no parser;
  extração **ancorada em rótulos** (nunca lê o "C.N.P.J." do escritório no cabeçalho). Coberto por
  teste.
- **Transação:** falha no meio → rollback; `importacoes.status='falha'`.
- **Idempotência:** reimportar o mesmo arquivo → "0 novos, 0 alterados".

## 10. Segurança e LGPD (linha da V8)

- O arquivo enviado contém dados pessoais; é **processado em memória e descartado** — **não** é
  salvo no Storage.
- A prévia (`importacao_itens`) tem **RLS** e **expiração**; rotina de limpeza remove prévias velhas.
- Acesso à tela e aos dados restrito por papel.

## 11. Papéis / RLS

- **Cadastral** (Empresas, Clientes): importável por **admin/assistente**.
- **Contratos** (valores/honorário): importável apenas por **admin/financeiro**; `contratos_dominio`
  segue a RLS de `clientes_financeiro` (assistente não vê valores). Split por arquivo.

## 12. Testes (TDD, padrão do projeto)

- **Parser (unitário):** fixtures = **cópias anonimizadas** dos três arquivos reais. Testa extração
  de cada campo, conversão de data serial, CNPJ, regime, e o `.xls` "torto" com cabeçalho repetido.
- **Reconciliação (unitário):** novos/atualizados/conflitos/inalterados/**idempotência**; junção por
  CNPJ; classificação de pendências.
- **RLS (`db:test`):** confirma que **assistente não enxerga** `contratos_dominio`.
- **E2E (caminho feliz):** upload dos 3 arquivos → prévia → aplicar → conferir no banco
  (~123 clientes, regimes corretos, honorários espelhados).

## 13. Evoluções futuras (fora da V2)

- **Automação:** `FontePastaAutomatica` + agendamento no módulo Domínio *Processos* → import
  desassistido (aplicar por regra, sem tela).
- **API oficial:** `FonteApi` como adaptador, caso a Onvio passe a oferecer extração adequada.
- **Faturamento da Escrita Fiscal** (receita declarada do cliente) para a V5 (NFS-e).
- **Inscrição Municipal** e outros campos via exports adicionais, conforme necessidade.

## 14. Decisões em aberto / riscos

- **Formato preferido do export:** confirmar se o Domínio exporta CSV/TXT/"Conjunto de Dados"
  (mais estável que o `.xls` de impressão). Não bloqueia — o leitor tolerante já funciona.
- **Microempresa → Simples:** assume-se que "Microempresa" na coluna de regime equivale a Simples
  Nacional; validar com um caso real antes de aplicar em massa.
- **Status "Ativa - Sem movimento":** mapeado para `ativo`; avaliar se merece sub-status próprio.
- **Clientes-PF (6) sem empresa:** decidir na implementação se entram como `PF`/`Isento/PF` ou
  ficam só como pendência.
