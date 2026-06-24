# Versionamento e branches

Como numeramos versões, marcamos releases e organizamos branches no **CRM Contábil**.

## Versionamento semântico (SemVer)

Usamos [SemVer](https://semver.org/lang/pt-BR/): `MAJOR.MINOR.PATCH` (ex.: `1.2.3`).

- **MAJOR** — um novo marco do [`ROADMAP.md`](../ROADMAP.md) (V1, V2, …). Cada versão do roadmap
  vira um *major*: V1 = `1.0.0`, V2 = `2.0.0`, etc. Pode conter mudanças incompatíveis.
- **MINOR** — funcionalidade nova compatível dentro do marco atual (ex.: `1.1.0`).
- **PATCH** — correção de bug ou ajuste compatível (ex.: `1.0.1`).

> Antes de um marco estar "pronto" pode-se usar pré-lançamentos: `2.0.0-rc.1`, `2.0.0-beta.1`.

## Tags e releases

- Cada versão lançada recebe uma **tag git anotada** com prefixo `v`: `v1.0.0`.
- A tag aponta para o commit em `main` que representa a release.
- Publicamos a release no GitHub a partir da tag, com as notas vindas do
  [`CHANGELOG.md`](../CHANGELOG.md).

```bash
# criar e publicar uma release
git tag -a v1.0.0 -m "v1.0.0 — Fundação da plataforma"
git push origin v1.0.0
gh release create v1.0.0 --title "v1.0.0 — Fundação da plataforma" --notes-from-tag
```

## Changelog

Toda mudança relevante é registrada em [`CHANGELOG.md`](../CHANGELOG.md) (formato
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)). O fluxo:

1. Durante o desenvolvimento, acumule itens na seção **[Não lançado]**.
2. Ao lançar, renomeie **[Não lançado]** para a versão + data e crie nova seção **[Não lançado]** vazia.
3. Crie a tag e a release apontando para esse commit.

## Estratégia de branches

Fluxo enxuto, adequado a um projeto de um mantenedor evoluindo por marcos:

- **`main`** — sempre estável e deployável. Reflete a última versão lançada. Recebe tags.
- **`develop`** — integração do marco em andamento (a próxima versão do roadmap). É a base das
  feature branches.
- **`feat/<descrição>`** — uma branch por funcionalidade/tarefa, criada a partir de `develop`.
  Também `fix/<descrição>` para correções e `chore/<descrição>` para manutenção.
- **`hotfix/<descrição>`** — correção urgente em produção: sai de `main`, volta para `main`
  (gera um *patch*, ex.: `v1.0.1`) e é reintegrada em `develop`.

Fluxo típico de um marco (ex.: V2):

```bash
git switch develop                       # base do marco
git switch -c feat/dominio-export        # uma tarefa
# ... commits ...
git switch develop && git merge feat/dominio-export
# ao concluir o marco:
git switch main && git merge develop
git tag -a v2.0.0 -m "v2.0.0 — Integração com o Domínio Sistemas"
git push origin main v2.0.0
```

> Projeto solo pode commitar direto em `develop` para tarefas pequenas; as feature branches
> valem a pena para trabalho maior, revisão ou execução isolada (worktrees).

## Mensagens de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/pt-br/): `feat:`, `fix:`,
`docs:`, `chore:`, `refactor:`, `test:` — como já praticado no histórico do projeto.
