# RF-064 (devolução de acervo em rescisão) — Design

**O que é:** ao encerrar/rescindir o contrato com um cliente, gerar sob demanda um **pacote de devolução** — um
**ZIP** com o **termo de acervo (NBC PG 01)** + os **documentos do cliente** (do GED) — para a entrega ao
cliente ou à contabilidade sucessora. Fecha o RF-064 (o termo já existe, mas atado à transferência societária e
com itens digitados à mão). **Uma fatia; sem migration.**

## O estado de hoje (medido)

- `montarTermoHtml(d: DadosTermo)` (`src/lib/legalizacao/termo.ts`) gera o termo NBC PG 01;
  `tipo: "transferencia_entrada" | "transferencia_saida"` (a redação de saída é "entregue ao cliente… ou à
  contabilidade sucessora" — serve à rescisão). `ACERVO_PADRAO` é a lista de categorias do acervo.
- `gerarTermoAcervo(processoId, …)` (`legalizacao/actions.ts`) gera o PDF via `converterPdfHtml`, **exige** um
  `legalizacao_processo` de transferência e recebe os `itens` à mão; anexa o termo ao GED do cliente.
- `pizzip` está nas dependências (usado em `BaixarNotasZip`) — dá para montar ZIP, inclusive no servidor (Node).
- Documentos do cliente: `documentos` (GED, RF-060/061/062) com `nome`/`caminho_storage`; versões atuais via
  `agruparVersoes` (`src/lib/documentos/versoes.ts`); download por `createAdminSupabase().storage`.
- `nomeSeguro` (sanitiza nome p/ storage) em `documentos/actions.ts`.

## Escopo (decidido no brainstorm)

- **Pacote = ZIP** montado no servidor: termo (PDF) + documentos atuais do cliente.
- **Termo lista as duas coisas:** categorias padrão NBC (`ACERVO_PADRAO`) **e** a relação dos arquivos incluídos.
- **Sob demanda** na ficha do cliente (admin/gestor); reusa o termo existente sem depender de transferência.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Gatilho | ação sob demanda na ficha do cliente | Rescisão é decisão do escritório; nada automático. |
| Termo | `montarTermoHtml` + `tipo: "transferencia_saida"` | Redação de saída já cobre a rescisão; reuso. |
| Conteúdo do termo | `ACERVO_PADRAO` **+** nomes dos arquivos do pacote | Decidido: formal e auditável (casa com o ZIP). |
| Pacote | ZIP no servidor (`pizzip`) | Uma ação; sem orquestração no cliente. |
| Documentos | só as **versões atuais** (`agruparVersoes`) | Não empacotar versões substituídas. |
| Anexo | anexa o termo ao GED do cliente | Trilha da devolução (como o termo de transferência). |
| Guarda | teto de nº/tamanho, com aviso | Evita estourar memória do servidor. |

## Arquitetura

### Termo (extensão de `DadosTermo`/`montarTermoHtml`)

- `DadosTermo` ganha `arquivos?: string[]`. Quando presente e não vazio, `montarTermoHtml` renderiza, abaixo da
  lista de `itens` (categorias), uma segunda seção **"Documentos incluídos no pacote"** (`<ul>` dos `arquivos`).
- O fluxo de transferência atual passa `arquivos` **undefined** → nada muda (a segunda seção não aparece).

### Lógica pura

- `montarTermoHtml` com `arquivos` — o HTML passa a ter as duas seções (testável).
- `nomeEntradaZip(nome: string, i: number): string` — nome saneado e único para a entrada do ZIP
  (`${i+1}-${nomeSeguro(nome)}`), evitando colisão de nomes iguais. (`nomeSeguro` extraído/reusado.)

### Ação (`src/app/(app)/clientes/[id]/acervo-actions.ts`)

`gerarPacoteDevolucao(clienteId: string): Promise<{ zipBase64?: string; nome?: string; erro?: string }>`
(gate: `podeCriarCliente` — admin/assistente/contador):
1. Confirma que o usuário enxerga o cliente (RLS); carrega `razao_social`.
2. Carrega os documentos atuais do cliente (`documentos` + `agruparVersoes`) — `nome`/`caminho_storage`.
   **Guarda:** se `count > TETO_DOCS (200)`, devolve aviso ("baixe em partes"); soma de tamanhos estimada idem.
3. Monta o termo: `montarTermoHtml({ tipo: "transferencia_saida", cliente, marca (escritorio_config), itens:
   ACERVO_PADRAO, arquivos: nomes dos documentos, data: hoje, responsavel: perfil.nome })` → `converterPdfHtml`.
   Se a conversão falhar, devolve erro claro (mesmo comportamento do termo atual).
4. Monta o ZIP (`pizzip`, `type: "nodebuffer"`): `termo-acervo.pdf` + `documentos/${nomeEntradaZip(...)}` de cada
   arquivo (baixado do storage via `createAdminSupabase`; arquivo que falhar o download é **pulado** e listado
   num aviso, não aborta).
5. Anexa o termo ao GED do cliente (upload + `documentos.insert`, como `gerarTermoAcervo`).
6. Devolve `{ zipBase64, nome: "acervo-<razao_social saneada>.zip" }`.

### Tela

Seção **"Devolução de acervo"** na aba cadastro da ficha do cliente (gated `podeCriarCliente`), componente
client `DevolucaoAcervo`: um botão **"Gerar pacote de devolução (rescisão)"** que chama a action e dispara o
download do ZIP (base64 → Blob → link). Uma legenda explica que o pacote traz o termo NBC PG 01 + os documentos
do cliente, para entrega na rescisão.

## Fatia de implementação

Uma fatia: `arquivos` no termo + `nomeEntradaZip` (com testes) + `gerarPacoteDevolucao` + a seção
`DevolucaoAcervo` na ficha + release. **Sem migration.**

## Verificação

- **Lógica testável:** `montarTermoHtml` com `arquivos` (renderiza as duas seções; sem `arquivos` mantém uma
  só — não-regressão da transferência); `nomeEntradaZip` (saneamento + unicidade por índice).
- **Ação:** monta o ZIP com o termo + N documentos atuais; pula arquivo que falhar o download (com aviso);
  respeita o teto; anexa o termo ao GED; erro claro se o PDF falhar.
- **Tela:** o botão gera e baixa o ZIP; a legenda explica o conteúdo; controles sem `border` à mão (`divida-ui`).
- **Não-regressão:** o termo de transferência (`gerarTermoAcervo`) segue igual (passa `arquivos` undefined);
  `lint`/`typecheck`/`test`/`format:check`/`build`; **sem migration**, sem rota nova.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Disparo automático ao inativar o cliente | Sob demanda; a rescisão é uma decisão. |
| Assinatura eletrônica do termo (Clicksign) | Outra RF (RF-005); o termo aqui é para entrega. |
| Expurgar/arquivar os documentos após a devolução | Retenção é o RF-062; a devolução não apaga. |
| Empacotar versões substituídas do documento | Só as atuais entram (`agruparVersoes`). |

## Riscos

| Risco | Mitigação |
|---|---|
| ZIP grande estoura a memória do servidor | Teto de nº/tamanho + aviso; volume real é baixo. |
| `converterPdfHtml` (externo) falha | Devolve erro claro; o operador tenta de novo (comportamento do termo atual). |
| Arquivo com download com falha | É pulado e listado num aviso; o ZIP sai com o resto (não aborta tudo). |
| Nomes de arquivo iguais no ZIP | `nomeEntradaZip` prefixa por índice → entradas únicas. |
