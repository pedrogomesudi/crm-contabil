# Legalização / Societário (RF-011 a RF-014) — Design

**Data:** 2026-07-11
**Contexto:** Novo módulo. Reaproveita o *padrão* do motor de templates do onboarding e da severidade de prazos (sem tocar no onboarding em produção).

## Objetivo

Acompanhar processos societários e de legalização por **órgão**, com **número de protocolo**, prazos e status (RF-011); a partir de **modelos por tipo de serviço** (RF-012); registrando o **aviso ao cliente** a cada avanço (RF-013, versão enxuta); e cobrindo a **transferência de contabilidade** entrada/saída com checklist de acervo e termo de entrega — NBC PG 01 (RF-014).

## Decisões (brainstorm)

1. **Módulo dedicado** — tabelas próprias no padrão `template → etapas → instância`, com **órgão** e **protocolo** como campos de primeira classe. O onboarding fica intocado.
2. **Órgãos: enum fixo + "Outro"** (rótulo livre): Junta Comercial, Receita Federal, Prefeitura, Sefaz (Estado), Corpo de Bombeiros, Vigilância Sanitária, Outro.
3. **7 modelos semeados**, editáveis pelo admin (edição = Fatia B): abertura Simples, abertura Presumido, alteração de quadro, transformação, baixa, transferência entrada, transferência saída.
4. **RF-013 enxuto:** cada etapa tem "avisar cliente?" (no modelo) e **`cliente_avisado_em`** (marcado manualmente). Sem disparo automático nesta entrega — deixa a porta aberta para plugar o WhatsApp. **RF-013 fica parcial** por decisão explícita.
5. **Prazo em dias de calendário** (D+n), via `somarDias` — mesmo do onboarding.

## Entrega em fatias

- **Fatia A (esta):** motor + 7 modelos semeados + instanciar na ficha + acompanhamento (órgão/protocolo/prazo/status/baixa com anexo) + campo de aviso + painel global + menu. Entrega **RF-011, RF-012 (via seed) e RF-013 (registro)**.
- **Fatia B:** editor de modelos (admin cria/edita templates e etapas) — completa a configurabilidade do RF-012.
- **Fatia C:** termo de entrega da transferência (NBC PG 01) — completa RF-014.

---

## Modelo de dados (Fatia A) — migration idempotente

Enums:
- `legalizacao_tipo` = `abertura_simples`, `abertura_presumido`, `alteracao_quadro`, `transformacao`, `baixa`, `transferencia_entrada`, `transferencia_saida`
- `legalizacao_orgao` = `junta`, `receita`, `prefeitura`, `sefaz`, `bombeiros`, `vigilancia`, `outro`
- `legalizacao_proc_status` = `em_andamento`, `concluido`, `cancelado`
- `legalizacao_etapa_status` = `pendente`, `em_andamento`, `concluido`

Tabelas:

```
legalizacao_template(id, tipo legalizacao_tipo, slug unique, nome, descricao, ativo bool, criado_em)
legalizacao_template_etapa(id, template_id fk→template on delete cascade, ordem int,
  titulo, descricao, orgao legalizacao_orgao, prazo_dias int, responsavel_papel papel,
  anexo_obrigatorio bool default false, avisar_cliente bool default false)

legalizacao_processo(id, cliente_id fk→clientes on delete cascade, template_id fk→template,
  tipo legalizacao_tipo, titulo, status legalizacao_proc_status default 'em_andamento',
  data_inicio date not null, criado_por, criado_em, atualizado_em)
legalizacao_etapa(id, processo_id fk→processo on delete cascade, ordem int,
  titulo, descricao, orgao legalizacao_orgao, orgao_outro text,
  responsavel_papel papel, responsavel_id fk→usuarios,
  prazo date, status legalizacao_etapa_status default 'pendente',
  protocolo text, protocolo_em date,
  anexo_obrigatorio bool, anexo_path text,
  avisar_cliente bool default false, cliente_avisado_em timestamptz,
  observacao text, concluido_em timestamptz, concluido_por fk→usuarios,
  criado_em, atualizado_em, atualizado_por)
```

Índices: `idx_leg_processo_cliente(cliente_id)`, `idx_leg_etapa_processo(processo_id)`.

### RLS
- **templates** (`legalizacao_template`, `_template_etapa`): SELECT `auth_papel() in ('admin','contador','assistente')`; WRITE `auth_papel() = 'admin'` (mesmo do onboarding).
- **processo / etapa** — delegam a visibilidade ao cliente (tabela-filha):
  - SELECT: `exists (select 1 from clientes c where c.id = cliente_id)` (processo) e via join `processo → cliente` (etapa) — herda "contador só os seus; admin/assistente/financeiro todos".
  - WRITE: `auth_papel() in ('admin','assistente','contador') and exists (…cliente visível…)` — barra o financeiro (só lê) e limita o contador aos clientes dele.
- Trigger `legalizacao_etapa_integridade`: seta `atualizado_por/em`; ao virar `concluido`, seta `concluido_em/por` (se nulos).

### Seed (migration)
Os 7 templates com etapas curadas. Exemplos:
- **abertura_simples:** Viabilidade (Prefeitura) · Registro (Junta) · CNPJ (Receita) · Inscrição municipal (Prefeitura) · Simples Nacional (Receita) · Alvará (Prefeitura, anexo) · Bombeiros (Bombeiros).
- **transferencia_entrada:** Distrato com a contabilidade anterior · Recebimento do acervo (anexo obrigatório) · Procurações e acessos · Conferência de obrigações pendentes.
- **transferencia_saida:** Comunicação da saída · Devolução do acervo (anexo) · Termo de entrega (NBC PG 01) · Baixa de procurações/acessos.

(Etapas com `orgao`, `prazo_dias`, `responsavel_papel`, `anexo_obrigatorio`, `avisar_cliente` conforme o caso; a curadoria completa vai na migration.)

## Componentes e arquivos (Fatia A)

### Biblioteca (pura, testável)
- **`src/lib/legalizacao/tipos.ts`**: `LEGALIZACAO_TIPOS`, `LEGALIZACAO_ORGAOS` (valor→rótulo), tipos TS.
- **`src/lib/legalizacao/processo.ts`**:
  - `materializarEtapas(etapasTemplate, dataInicio): EtapaSeed[]` — calcula `prazo = somarDias(dataInicio, prazo_dias)` e copia campos.
  - `progressoProcesso(etapas): { total, concluidas, pct, concluido, proximoPrazo }`.
  - Reusa `classificarAlerta` de `@/lib/onboarding/alertas` para a severidade no painel.

### Ações — `src/app/(app)/legalizacao/actions.ts`
- `iniciarProcesso(clienteId, templateId, dataInicio)` — gate (admin/assistente/contador-dono); lê o template + etapas; cria `legalizacao_processo` e insere as `legalizacao_etapa` materializadas.
- `atualizarEtapa(etapaId, patch)` — patch parcial: `status`, `protocolo`, `protocolo_em`, `prazo`, `orgao_outro`, `responsavel_id`, `observacao`, `cliente_avisado` (→ set `cliente_avisado_em = now()`), `remover_aviso`.
- `anexarComprovanteEtapa(etapaId, file)` — valida (magic bytes/tamanho), upload em `documentos` `legalizacao/<processo>/<etapa>.<ext>`, grava `anexo_path`.
- `concluirProcesso(id)` / `cancelarProcesso(id)` — muda status do processo.

### Telas
- **Ficha do cliente** (`clientes/[id]/page.tsx`): nova seção **"Legalização / Societário"** — lista os processos do cliente (tipo, status, progresso, próximo prazo) + botão "Novo processo" (escolhe o modelo e a data de início). Componente `LegalizacaoSection.tsx`.
- **Detalhe do processo** (`/legalizacao/[id]`): as etapas em ordem — por etapa: órgão, **protocolo** + data, **prazo** (com selo de severidade), status (select), responsável, **anexar comprovante**, observação, e "cliente avisado" (marca `cliente_avisado_em`). Ações de concluir/cancelar processo.
- **Painel global** (`/legalizacao`): processos de todos os clientes visíveis, com **filtros por órgão, status e prazo** (vencendo/atrasado) e selo de severidade — reusa o padrão de `classificarAlerta`. Acesso por **item no menu "Legalização"** (admin/assistente/contador).

### Permissões
- `podeGerenciarLegalizacao(papel)` → admin/assistente/contador (financeiro só lê). Em `src/lib/legalizacao/permissoes.ts` (ou junto de clientes/permissoes).

## Testes (Fatia A)
- **Unit** (`legalizacao/processo.test.ts`): `materializarEtapas` (prazo = data_inicio + n; nulos preservados; ordem), `progressoProcesso` (pct, concluído, próximo prazo), rótulos de `LEGALIZACAO_TIPOS`/`ORGAOS`.
- **RLS** (`rls.test.sql`): contador cria/atualiza processo no **próprio** cliente (efeito) e **não** no de outro (barrado); admin/assistente em qualquer; financeiro **lê** mas **não escreve**; templates só admin escreve.
- Suíte completa (`npm test`, `npm run db:test`, `lint`, `typecheck`) verde antes de cada commit.

## Fora de escopo (fatias seguintes / futuro)
- **Fatia B:** editor de modelos (CRUD de templates/etapas pelo admin).
- **Fatia C:** termo de entrega (NBC PG 01) da transferência — geração de PDF (reusa `converterPdfHtml` + Marca).
- Disparo automático do aviso ao cliente (WhatsApp) — RF-013 completo, futuro.
- Comunicação por e-mail (RF-051) — outra frente.

## Segurança (preservar)
- Comprovantes no bucket **privado** `documentos`; leitura por URL assinada; validação por magic bytes/tamanho (padrão da Marca/onboarding).
- RLS por dono do cliente reforçada na policy (não só na action); financeiro nunca escreve.
- Onboarding em produção **não é alterado** (módulo separado).
