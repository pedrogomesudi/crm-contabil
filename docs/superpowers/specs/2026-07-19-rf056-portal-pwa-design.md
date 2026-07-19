# RF-056 — Portal do cliente como PWA instalável — Design

**O que é:** tornar o **portal do cliente** (`src/app/(portal)/*`) um **PWA instalável** — o cliente
"adiciona à tela inicial" e o portal abre como app (standalone), com ícone e splash. **Sem cache offline
pesado** (os dados — guias, boletos, documentos — são dinâmicos e autenticados; ficam online), apenas uma
página de fallback quando sem rede. Fecha o RF-056. **Uma fatia.**

> **Nota — RF-055 já está pronto.** A segmentação de comunicados por **município** existe de ponta a ponta:
> `Filtro.cidade`/`uf` em `src/lib/comunicados/segmento.ts`, aplicado por `aplicarFiltro` (com normalização de
> acento), populado em `comunicados/actions.ts` a partir de `clientes.endereco.cidade`, e exposto no
> `FormComunicado` (campos cidade/UF). Não há spec a escrever para RF-055.

## O estado de hoje (medido)

- O portal é um grupo de rotas `(portal)` com layout próprio (`src/app/(portal)/layout.tsx`, server component;
  gate `ehCliente`) e páginas responsivas (`/portal`, `/documentos`, `/notas`, `/guias`, `/boletos`,
  `/solicitacoes`). **Responsivo, mas não instalável.**
- **Não há** `manifest`, service worker, ícones em `public/`, nem `next-pwa`/`workbox`.
- Marca: `escritorio_config.nome` (usado no header do portal). Cores da marca (tokens): verde `#0FA968`, creme
  `#F7F6F2`, texto `#101614`.

## Escopo (decidido no brainstorm)

- **Portal instalável** (manifest + ícones + service worker mínimo). **Sem** cache offline de dados.
- Só o portal (`(portal)`); o app da equipe (`(app)`) **não** vira PWA nesta fatia.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Superfície | só o **portal**, escopo `/portal` | O RF pede "app do portal"; escopo isola do app da equipe. |
| Manifest | `app/manifest.ts` (Next 16) com `scope`/`start_url` = `/portal`, `display: standalone` | Um manifest app-wide; o escopo restringe o PWA ao portal. |
| Link do manifest | via `metadata.manifest` **no layout do portal** | Só as páginas do portal declaram o manifest (o app da equipe não). |
| Service worker | `public/sw.js` mínimo — instala/ativa + fallback de navegação offline; **sem** cache de dados | Instalabilidade + UX de rede caída, sem a complexidade de invalidar cache autenticado. |
| Registro do SW | client component no layout do portal, `scope: "/portal"` | Registra só quando o cliente está no portal. |
| Ícones | `public/icons/portal-192.png`, `portal-512.png`, `portal-maskable-512.png` | Requisito de instalabilidade (Chrome exige 192+512). |

## Arquitetura

### O manifest (`src/app/manifest.ts`)

```ts
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portal do cliente",
    short_name: "Portal",
    description: "Guias, boletos, notas e documentos do seu escritório contábil.",
    start_url: "/portal",
    scope: "/portal",
    display: "standalone",
    background_color: "#F7F6F2",
    theme_color: "#0FA968",
    icons: [
      { src: "/icons/portal-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/portal-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/portal-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

Servido em `/manifest.webmanifest`. **Nota:** o `name`/`short_name` são genéricos ("Portal do cliente") — não
dependem do nome do escritório (o manifest é estático). O header do portal segue mostrando a marca real.

### O link do manifest + metas iOS (no layout do portal)

`src/app/(portal)/layout.tsx` passa a exportar:

```ts
export const metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Portal" },
};
export const viewport = { themeColor: "#0FA968" };
```

Assim só as rotas do portal declaram o manifest e as metas de web-app (iOS). O app da equipe não vira
instalável.

### O service worker (`public/sw.js`)

Mínimo — instalabilidade + fallback de navegação quando sem rede (não cacheia dados autenticados):

```js
const OFFLINE = "/portal/offline";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open("portal-v1").then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => { self.clients.claim(); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  // Só navegações (HTML): se a rede cair, mostra a página de offline.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
  }
});
```

Uma rota estática **`/portal/offline`** (`src/app/(portal)/portal/offline/page.tsx`) com uma mensagem simples
("Sem conexão — reabra quando voltar a internet").

### O registro do SW (`RegistrarServiceWorker`)

Client component montado no layout do portal:

```tsx
"use client";
import { useEffect } from "react";
export function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/portal" }).catch(() => {});
    }
  }, []);
  return null;
}
```

### Os ícones (`public/icons/`)

`portal-192.png`, `portal-512.png` e `portal-maskable-512.png` — a marca SALDO (um "S" verde sobre creme, ou o
mark do escritório). Requisito de instalabilidade; gerados no plano a partir de um SVG simples da marca.

## Fatia de implementação

Uma fatia: `manifest.ts` + metadata/viewport no layout do portal + `public/sw.js` + rota `/portal/offline` +
`RegistrarServiceWorker` no layout + os ícones em `public/icons/` + release.

## Verificação

- **Instalabilidade:** com o app rodando, o Chrome oferece "Instalar" no portal (manifest válido + ícones
  192/512 + SW registrado no escopo `/portal`); no iOS, "Adicionar à Tela de Início" abre standalone.
- **Escopo:** o manifest/SW valem só em `/portal`; navegar no app da equipe não oferece instalação.
- **Offline:** com a rede desligada, uma navegação no portal cai na página `/portal/offline` (não numa tela de
  erro do navegador); dados online seguem exigindo rede.
- **Não-regressão:** `/portal/offline` é rota nova sob `(portal)` — o guard `rotas-alcancaveis` cobre o portal?
  (o portal tem layout próprio, fora do escopo do guard de `(app)`); `lint`/`typecheck`/`test`/`format:check`/
  `build`; **sem migration**.

## Fora de escopo

| O quê | Por quê |
|---|---|
| Cache offline de guias/boletos/documentos | Dados dinâmicos e autenticados; complexidade alta, valor baixo num F3. |
| App do escritório (`(app)`) como PWA | O RF-056 é "do portal". |
| Push notifications (web push) | Outra RF; exige backend de push e permissão. |
| App nativo (React Native / stores) | O RF admite "ou PWA"; o PWA é a via escolhida. |
| Manifest com nome dinâmico do escritório | O manifest é estático; a personalização fica no header do portal. |

## Riscos

| Risco | Mitigação |
|---|---|
| Ícones ausentes quebram a instalabilidade | O plano inclui os 3 PNGs em `public/icons/`; a verificação checa o "Instalar". |
| SW cacheando resposta autenticada por engano | O `fetch` só intercepta `mode === "navigate"` e sempre tenta a rede primeiro; nada de dados é cacheado. |
| SW "preso" numa versão antiga | `skipWaiting` + `clients.claim`; o cache tem nome versionado (`portal-v1`) para trocar quando evoluir. |
| iOS com suporte parcial a PWA | As metas `appleWebApp` cobrem o "Adicionar à Tela"; recursos avançados (offline) não são prometidos ao cliente. |
