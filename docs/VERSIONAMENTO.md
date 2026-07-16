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
3. Suba o `version` do `package.json` para a mesma versão (`npm version X.Y.Z --no-git-tag-version`).
4. Crie a tag e a release apontando para esse commit.

> O passo 2 foi esquecido em **três releases seguidas** (6.1.0 a 6.3.0 ficaram listadas como "não
> lançadas" mesmo já tagueadas), então o passo 3 não fica no lembrete: o **`src/tests/versao.test.ts`**
> exige que o `package.json` bata com a última versão do CHANGELOG, e o CI barra o PR se divergirem.
> A versão vale porque o **`/api/health` a devolve** — é como se sabe qual release está no ar.

## Estratégia de branches

Fluxo enxuto, adequado a um projeto de um mantenedor evoluindo por marcos:

- **`main`** — sempre estável e deployável. Reflete a última versão lançada. Recebe tags.
  **É protegido:** não aceita push direto (nem de admin), force-push nem deleção. Só entra por
  **Pull Request** com o CI (`verify`) verde e atualizado em relação ao `main`. O CI roda lint,
  `format:check`, build, typecheck e testes — se algo estiver vermelho, o merge não acontece.
- **`develop`** — integração do marco em andamento (a próxima versão do roadmap). É a base das
  feature branches.
- **`feat/<descrição>`** — uma branch por funcionalidade/tarefa, criada a partir de `develop`.
  Também `fix/<descrição>` para correções e `chore/<descrição>` para manutenção.
- **`hotfix/<descrição>`** — correção urgente em produção: sai de `main`, volta para `main`
  **por PR** (gera um *patch*, ex.: `v1.0.1`) e é reintegrada em `develop`. Urgência não dispensa o
  CI: se o `verify` não fechar, o hotfix não entra — a pressa é justamente quando se quebra algo.

Fluxo típico de um marco (ex.: V2):

```bash
git switch develop                       # base do marco
git switch -c feat/dominio-export        # uma tarefa
# ... commits ...
git switch develop && git merge feat/dominio-export
git push origin develop                  # o CI também roda em develop

# ao concluir o marco, ainda em develop — os dois juntos, num passo só:
#   1. CHANGELOG: renomeie [Não lançado] para [2.0.0] — AAAA-MM-DD e abra uma nova vazia
#   2. package.json: npm version 2.0.0 --no-git-tag-version
# (o `versao.test.ts` exige que os dois batam — esquecer um quebra o CI, de propósito)

# o main é protegido, então a entrega vai por PR:
gh pr create --base main --head develop --title "v2.0.0 — Integração com o Domínio Sistemas"
gh pr checks --watch                     # espera o verify ficar verde
gh pr merge --merge                      # cria o merge commit no main

# a tag aponta para o merge commit JÁ no main (só depois do merge):
git switch main && git pull
npm run release:tag                      # lê a versão do package.json e confere onde você está
git push origin v2.0.0
gh release create v2.0.0 --notes-from-tag
```

> Por que PR se o projeto é solo: o CI só consegue barrar o que ele vê **antes** de entrar. Com push
> direto, o `main` já estava quebrado quando o CI reclamava — foi assim que o `format:check` ficou
> três semanas vermelho sem incomodar ninguém. O PR não é cerimônia de revisão aqui; é o portão.

> Projeto solo pode commitar direto em `develop` para tarefas pequenas; as feature branches
> valem a pena para trabalho maior, revisão ou execução isolada (worktrees).

## Mensagens de commit

Seguimos [Conventional Commits](https://www.conventionalcommits.org/pt-br/): `feat:`, `fix:`,
`docs:`, `chore:`, `refactor:`, `test:` — como já praticado no histórico do projeto.
