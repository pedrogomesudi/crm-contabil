# Curadoria da matriz de obrigações (design)

## Objetivo

A matriz de obrigações é o **core do produto**: é dela que sai o calendário de cada cliente. Hoje ela
tem 9 obrigações padrão e **nenhuma forma de saber se ainda estão certas** — não há base legal, não há
data de revisão, e quando a lei muda um prazo não existe caminho para propagar a correção a quem já
semeou. O risco não é o sistema quebrar: é ele seguir gerando, com confiança, uma data errada.

Este sub-projeto dá à matriz o que falta para ser **auditável e mantida**: cada obrigação passa a
carregar a norma que a fundamenta, a data em que foi conferida por gente, e o sistema passa a mostrar
o que está velho e a propagar correções do padrão sem atropelar o que o escritório customizou.

**Achado que motiva a fatia:** a `DCTFWEB` da matriz padrão está com vencimento no **dia 20**; a
IN RFB 2.005/2021 fixa o **dia 15** do mês seguinte. O erro está no repositório desde a v6.x e nada no
sistema tinha como apontá-lo. Ele vira o primeiro caso de uso real do mecanismo.

## Contexto (do que existe)

- Tabela `obrigacao` (migration `0061`): `codigo`, `nome`, `descricao`, `esfera`, `periodicidade`,
  `aplicavel_a`, `condicao_flags`, `condicao_modo`, `ufs`, `cnae_prefixos`, vencimento paramétrico
  (`venc_dia`, `venc_mes_offset`, `venc_mes`, `venc_ano_offset`), `prazo_interno_dias_uteis`,
  `antecipa`, `ativa`, `ordem`.
- `MATRIZ_PADRAO` (`src/lib/obrigacoes/seed.ts`): as 9 obrigações de partida.
- `semearMatrizPadrao()`: insere **apenas os códigos ausentes**. Nunca atualiza o que já existe — por
  segurança (não sobrescrever customização), mas o efeito colateral é que **correção nenhuma chega**.
- Tela `/configuracoes/obrigacoes`: `EditorMatriz` (CRUD linha a linha) + escalonamento + notificações.
- Motor (`geracao.ts`, `prazo.ts`): resolve incidência por regime/flags/UF/CNAE e calcula vencimento,
  antecipando para dia útil quando `antecipa`.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Onde mora a fonte | **Campo por obrigação** (`base_legal` + `fonte_url`) | Auditar exige ver a norma ao lado da regra, não num documento à parte que ninguém abre. |
| Quem valida | **Uma pessoa marca "revisada"** (data + quem) | Curadoria é ato humano. O sistema não pode se autodeclarar correto. |
| Limiar de validade | **12 meses, fixo no código** | O ciclo fiscal é anual; um interruptor por escritório seria ajuste de conveniência sobre um prazo que não é opinião. |
| Propagação do padrão | **Diff explícito, aplicado item a item** | Sobrescrever em massa apagaria customização legítima; não propagar deixa o erro vivo. O meio-termo é mostrar a divergência e deixar escolher. |
| Regra não representável | **Campo de observação**, não mudança do motor | Ex.: EFD-Contribuições vence no *10º dia útil* do 2º mês — o modelo só sabe "dia fixo". Registrar a imprecisão é honesto; mudar o motor é outra fatia. |
| Seed nasce revisada? | **Não. `revisada_em` nulo** | Nenhuma das 9 foi conferida por um contador dentro deste sistema. Marcá-las como revisadas seria fabricar uma garantia. |

## Arquitetura

### O estado de revisão é derivado, não guardado

```ts
export type EstadoRevisao = "nunca" | "em_dia" | "vencida";
export function estadoRevisao(revisadaEm: string | null, hoje: string): EstadoRevisao;
```

Guardar "está vencida" num campo criaria uma segunda verdade que envelhece sozinha — o mesmo motivo
pelo qual o status de aprovação dos templates da Meta não é copiado para o banco. Deriva-se de
`revisada_em` e da data de hoje, com limiar de 12 meses.

### O diff entre o banco e o padrão é uma função pura

```ts
export type Divergencia = { codigo: string; campo: string; noBanco: unknown; noPadrao: unknown };
export function diffMatriz(banco: LinhaComparavel[], padrao: ObrigacaoSeed[]): {
  ausentes: string[];       // no padrão, não no banco  → semear
  divergentes: Divergencia[]; // existem nos dois, com campo diferente
};
```

Só campos **normativos** entram na comparação (vencimento, periodicidade, esfera, incidência, base
legal). `ativa`, `ordem` e `prazo_interno_dias_uteis` **não**: são preferências do escritório, não
matéria de lei — divergir neles é o sistema funcionando.

### Modelo de dados (migration `0133`)

```sql
alter table obrigacao add column if not exists base_legal text;
alter table obrigacao add column if not exists fonte_url text;
alter table obrigacao add column if not exists observacao_curadoria text;
alter table obrigacao add column if not exists revisada_em date;
alter table obrigacao add column if not exists revisada_por uuid references usuarios(id);
```

Sem tabela nova: é atributo da obrigação, não entidade. Histórico de quem revisou o quê ao longo do
tempo fica para depois — a pergunta que importa agora é "isto ainda vale?", não "quem mexeu em 2024".

### A tela

Em `/configuracoes/obrigacoes`, a listagem ganha por linha um **selo de revisão** — *em dia*,
*conferir* (vencida) ou *nunca revisada* — e o editor ganha **base legal**, **fonte** e **observação**.
Cada linha tem **Marcar como revisada**, que grava data e autor.

Acima da matriz aparece o **painel de divergências** quando o padrão do sistema difere do que está no
banco: uma linha por campo divergente, com o valor de cá e o de lá, e a opção de aplicar só o que se
quer. É o que teria mostrado o DCTFWeb dia 20 × dia 15 no dia em que a correção entrou no repositório.

## Falha

- Sem base legal preenchida, a obrigação aparece como **nunca revisada** — não bloqueia nada, mas fica
  visível na tela que decide o calendário.
- Aplicar uma divergência é um `update` de campo específico; falha devolve o erro ao operador.
- O motor **não muda**: uma obrigação sem curadoria continua gerando instâncias normalmente. Curadoria
  informa, não interrompe — travar o calendário por falta de revisão seria pior que a doença.

## Fatias de implementação

| Fatia | Entrega | Migration |
|---|---|---|
| **A** | Rastreabilidade e propagação: `0133`, base legal nas 9 padrão, estado de revisão, diff e aplicação item a item, correção do DCTFWeb | sim (`0133`) |
| **B** | Cobertura: ampliar a matriz padrão (eSocial, DIRBI, EFD ICMS/IPI, DIMOB, DMED, DAS e outras) | — |
| **C** | Reforma Tributária: obrigações de CBS/IBS na transição | a definir |

A **B** vem depois de propósito: ampliar antes de existir base legal e propagação seria multiplicar por
dois a superfície do que envelhece em silêncio.

## Verificação

- **Puros:** `estadoRevisao` no limite exato de 12 meses e com data nula; `diffMatriz` com campo
  normativo divergente, com campo de preferência divergente (não acusa), com código ausente e com
  matrizes idênticas.
- **Seed:** toda obrigação padrão tem `baseLegal` não vazia; nenhuma nasce com `revisadaEm`.
- **Regressão do prazo:** teste fixando `DCTFWEB` no dia 15 — o valor que a IN 2.005/2021 manda.
- **Render:** os três selos de revisão e o painel de divergências.
- **Sempre:** `lint`, `typecheck`, `test`, `format:check`, `build`; migration idempotente e aplicada em
  produção antes do deploy.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Histórico de alterações da matriz | A pergunta atual é "vale hoje?"; auditoria temporal é outra entidade. |
| Buscar a norma automaticamente (scraping do Planalto/RFB) | Fonte instável e sem garantia; a curadoria é humana por definição. |
| Vencimento por "N-ésimo dia útil" | Mudança no motor de prazo; a observação registra a imprecisão até lá. |
| Alertar por e-mail que a matriz venceu | Primeiro tornar visível na tela; notificar sem ninguém olhar é ruído. |

## Riscos

| Risco | Mitigação |
|---|---|
| A base legal que eu escrever na seed estar desatualizada | Nenhuma nasce marcada como revisada: o selo diz "nunca revisada" até um contador confirmar. |
| Aplicar divergência sobrescrever ajuste deliberado do escritório | A aplicação é item a item, com o valor atual à vista; campos de preferência nem entram no diff. |
| O escritório ignorar o selo e a matriz envelhecer igual | O selo fica na tela que edita a matriz, não num relatório à parte. Notificação ativa é a fatia seguinte, se o selo não bastar. |
