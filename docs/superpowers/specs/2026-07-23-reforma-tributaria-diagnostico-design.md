# Reforma Tributária (IBS/CBS) — diagnóstico e plano (design)

> **Status:** diagnóstico. Nenhuma linha de código de emissão foi alterada. Este documento existe para
> substituir a "Fatia C" da curadoria da matriz, cuja premissa a pesquisa desmentiu.

## Por que a Fatia C original não existe

A spec da curadoria previa uma Fatia C: *"Reforma Tributária: obrigações de CBS/IBS na transição"*, na
matriz de obrigações. **Não há o que adicionar.**

Pelo **Ato Conjunto RFB/CGIBS nº 1, de 22/12/2025**, a obrigação acessória de IBS/CBS em 2026 é
**destacar os tributos no documento fiscal**, operação por operação — não uma declaração periódica com
vencimento. A apuração do ano tem **caráter meramente informativo, sem efeitos tributários**, e quem
cumpre as acessórias fica **dispensado do recolhimento** da alíquota-teste de 2026 (0,9% CBS + 0,1% IBS).

Criar uma linha na matriz com vencimento mensal seria inventar um prazo inexistente — exatamente o erro
que a curadoria existe para evitar. A matriz é um calendário por competência; esta obrigação não tem
data, tem documento.

## O que a pesquisa achou no lugar

O risco não está na matriz: está no **emissor de NFS-e**.

### Estado do código (23/07/2026)

- `src/lib/nfse/dps.ts` monta a DPS no **layout nacional versão 1.00**.
- **Nenhuma ocorrência de "IBS" ou "CBS"** em todo o módulo `src/lib/nfse/`.
- A **NT 004 SE/CGNFS-e** cria o grupo `IBSCBS` em `NFSe/infNFSe/DPS/infDPS/`, com subgrupos, CST e
  classificação tributária (`cClassTrib`) — layout novo, não um campo solto.

### Estado da base (produção, consultado em 23/07/2026)

| Emitente | Regime | Situação |
|---|---|---|
| Config principal (escritório) | **Simples Nacional** | produção, município 3170206 |
| DGX Gestão e Negócios LTDA | **Simples Nacional** | ativo, produção |
| Jordana Fernandes Academy LTDA | **Simples Nacional** | ativo, produção |

**Nenhum emitente em regime regular.** 78 NFS-e autorizadas, a última em 20/07/2026 — o emissor está em
uso corrente.

### As datas que importam

| Data | O quê | Atinge a base atual? |
|---|---|---|
| **03/08/2026** | Fim da emissão sem campos de IBS/CBS — **para não optantes do Simples** | **Não.** Os três emitentes são Simples. |
| **01/09/2026** | NFS-e de **padrão nacional** obrigatória para optantes do Simples (ME/EPP) | **Provavelmente já atendido** — o SALDO emite no padrão nacional desde a v5. Confirmar se a versão de layout exigida muda. |
| **Setembro/2026** | Janela para o optante do Simples escolher recolher IBS/CBS **pelo regime regular** (efeito em 2027) | Decisão de negócio. Se algum emitente optar, o grupo `IBSCBS` passa a ser necessário. |
| **2027** | CBS em alíquota integral; **PIS/COFINS extintos**; IPI a zero (salvo ZFM); Imposto Seletivo instituído | Sim — muda a matriz de obrigações e o emissor. |
| **2029–2032** | Transição gradual do IBS; ICMS e ISS caindo | Sim, gradual. |
| **2033** | ICMS, IPI e ISS extintos | Sim. |

**Conclusão: não há emergência em 11 dias.** O prazo real para o grupo `IBSCBS` é a virada de 2027, ou
antes disso se algum emitente optar pelo regime regular na janela de setembro/2026.

## Fatias propostas

| Fatia | Entrega | Por que nesta ordem |
|---|---|---|
| **C1 — Vigência na matriz** | `vigente_de` / `vigente_ate` por obrigação; o motor deixa de gerar instância fora da vigência | É a peça que falta na curadoria e **não depende de decisão fiscal de ninguém**. Em 2027 a EFD-Contribuições deixa de fazer sentido com o fim de PIS/COFINS, e hoje a matriz geraria a obrigação para sempre. |
| **C2 — Grupo `IBSCBS` na DPS** | Adequação do emissor ao layout da NT 004, com homologação antes de produção | Caminho crítico do faturamento. Precisa de ambiente de homologação e de decisão sobre CST/`cClassTrib` do serviço — não é trabalho para fazer às cegas. |
| **C3 — Alerta das janelas** | Lembrete das datas de decisão (setembro/2026) no calendário do escritório | Só faz sentido depois de C1, que dá o vocabulário de vigência. |

## Verificação (C1, quando executada)

- **Puros:** obrigação sem vigência gera em qualquer competência (comportamento de hoje); com
  `vigente_ate` no passado não gera; no limite exato da competência de corte, gera.
- **Não-regressão:** as 16 obrigações atuais não têm vigência preenchida e continuam gerando igual.
- **Diff:** `vigente_de`/`vigente_ate` entram como campos **normativos** (mudam por lei, não por
  preferência do escritório).

## Fora de escopo

| O quê | Por quê |
|---|---|
| Adicionar IBS/CBS à matriz de obrigações | Não é obrigação de calendário em 2026 — é campo em documento fiscal. |
| Implementar `IBSCBS` sem homologação | Rejeição em produção interromperia o faturamento; layout fiscal novo exige teste em ambiente de homologação. |
| Decidir CST / `cClassTrib` dos serviços do escritório | É classificação fiscal, do contador — o sistema oferece o campo, não a resposta. |

## Riscos

| Risco | Mitigação |
|---|---|
| Algum emitente optar pelo regime regular em setembro/2026 sem o emissor pronto | C2 precisa estar entregue antes da virada de 2027; a decisão de setembro é o gatilho para priorizá-la. |
| Prazo de 03/08 valer para o Simples por norma que não localizei | As fontes oficiais consultadas dizem "para não optantes do Simples". Confirmar com a contabilidade antes da data — o custo de checar é baixo. |
| Novo emitente cadastrado em regime regular sem ninguém notar | C2 pode incluir um aviso na tela do emitente quando `simples_nacional = false`. |
