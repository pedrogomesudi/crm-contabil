# Comercial — Kanban arrastável no quadro — Design

**Data:** 2026-07-08
**Marco:** permitir mover as oportunidades **arrastando os cards** entre as colunas do funil (Kanban),
mantendo as setas ← → e os botões Ganho/Perdido.

**Contexto:** o quadro `/comercial` (`QuadroComercial.tsx`) já tem 4 colunas ativas (Novo, Contato feito,
Proposta enviada, Negociação) e move via botões ← → (`etapaAdjacente` + `definirEtapa`). A ação de mover
etapa (`definirEtapa(id, etapa)`) já existe e é reaproveitada.

## Decisões (do brainstorming)

1. Arrastar-e-soltar **nativo do HTML** (sem biblioteca nova).
2. **Manter** as setas ← → e os botões Ganho/Perdido (fallback no celular + ações terminais).

## Escopo

- Somente `src/app/(app)/comercial/QuadroComercial.tsx`.
- **Sem** migration, dependência, mudança de action ou de schema.

## Comportamento

- **Cards ativos arrastáveis:** cada card das colunas ativas recebe `draggable`. No `onDragStart`,
  guarda-se em estado local a oportunidade arrastada (`{ id, etapa }`); `onDragEnd` limpa.
- **Colunas como alvo:** cada coluna trata `onDragOver` (com `preventDefault()` para permitir soltar) e
  aplica um **realce** enquanto um card paira sobre ela; no `onDrop`, se a coluna de destino for diferente
  da etapa atual do card arrastado, chama `definirEtapa(id, etapaDaColuna)` (via o mesmo wrapper `chamar`
  que trata erro + `router.refresh()`). Soltar na mesma coluna é no-op.
- **Realce:** estado local `sobreColuna: EtapaOportunidade | null` marca a coluna sob o cursor; ela ganha
  um anel/realce (`ring-1 ring-verde` ou borda) enquanto `sobreColuna === chave`. `onDragLeave`/`onDrop`
  limpam.
- **Cursor:** cards arrastáveis usam `cursor-grab`.
- **Fechados:** os cards de "Fechados" (ganho/perdido) **não** são arrastáveis (permanecem como hoje).
- **Botões preservados:** ← →, Ganho, Perdido e "editar" seguem funcionando exatamente como estão.

## Estado (no componente)
```ts
const [arrastando, setArrastando] = useState<{ id: string; etapa: EtapaOportunidade } | null>(null);
const [sobreColuna, setSobreColuna] = useState<EtapaOportunidade | null>(null);
```
Handlers:
- Card: `draggable`, `onDragStart={() => setArrastando({ id: o.id, etapa: o.etapa })}`, `onDragEnd={() => { setArrastando(null); setSobreColuna(null); }}`.
- Coluna: `onDragOver={(e) => { e.preventDefault(); setSobreColuna(col.chave); }}`, `onDragLeave={() => setSobreColuna((s) => (s === col.chave ? null : s))}`, `onDrop={(e) => { e.preventDefault(); soltarNa(col.chave); }}`.
- `soltarNa(etapa)`: se `arrastando && arrastando.etapa !== etapa`, `void chamar(() => definirEtapa(arrastando.id, etapa))`; sempre limpa `arrastando`/`sobreColuna`.

## Tratamento de erros
- Sem card sendo arrastado no `onDrop` → ignora.
- Falha na action → o wrapper `chamar` já mostra `alert(erro)` e não atualiza.

## Testes
- Smoke atual (renderiza colunas + cards + "Fechados") mantido.
- **Novo assert:** os cards ativos têm o atributo `draggable` no HTML renderizado (ex.: o HTML contém
  `draggable="true"`).

## Migrations
Nenhuma.
