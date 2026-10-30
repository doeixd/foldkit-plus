# Foldkit Domains on Foldkit Plus

A reimplementation of [foldkit/foldkit-domains](https://github.com/foldkit/foldkit-domains),
the domain-search page modelled on Vercel Domains, on the released Foldkit
(0.170) and Foldkit Plus. The upstream application is copied unchanged beside
it, at [`../domains`](../domains/README.md), so the two run side by side and
upstream's own Playwright suites can be pointed at either.

The plan this follows, phase by phase, and what each package owns here, is
[`docs/design/foldkit-domains-PLAN.md`](../../../docs/design/foldkit-domains-PLAN.md).
It is being built: the sections below grow with each phase.

## What is built

| Phase | What it adds |
| --- | --- |
| 0 | The landing page and the 404 (served with status 404), rendered by `foldkit-ssr` through the Worker's entry and resumed in the browser; the route from `foldkit-site`; the look from a `foldkit-mixins` theme, with no CSS file |
| 1 | Search as you type: `query` mirrored to `?q=` by `foldkit-mirror`, the label the reads use settled by `foldkit-primitives`' debounce, pending cards and rows, the invalid-label error, Escape and the clear button |
| 2 | The Top Results' prices, read by name through `foldkit-remote` from `/remote` (`foldkit-remote-server`'s `serveFetch` in the Worker's entry), fresh for a minute; the failed-search error and Try again |
| 3 | All Results: every name in rows of six, drawn by `foldkit-mixins-ui`'s `WindowList` in the page's scroll; the rows in view (and two past each end) read their prices; the count of names checked |
| 4 | Filters and sort: availability and sort as `Picker`s (a dropdown on a desktop, a sheet on a phone), the TLD as a dropdown with typeahead or a searchable sheet; the Available filter and the price sorts read the whole catalog |

## How it compares to the upstream copy

| Upstream (Blocks preview) | Here |
| --- | --- |
| `Program.make` + `Runtime.hydrate`, `Server.renderToString` | `foldkit-ssr`'s `SSR.entry` and `SSR.hydrate` with a resume plan (`app.ts`'s `plan`) |
| `route.ts`'s parser and titles | `foldkit-site`: one node for `/`, `Site.parse` falling back to NotFound |
| Tailwind 4 and `styles.css` | `style.ts`: one theme, every element a Slot; the Slots upstream's suites select carry upstream's class |
| `?q=` in the route, written by a `ReplaceSearchUrl` Command per keystroke | `query` in the Model, kept in `?q=` by `Mirror.url` (replace) |
| A 150 ms sleep inside the fetch, cancelled by interruption | `debounce` from `foldkit-primitives/time` between the box and `settledLabel` |
| `SearchDomains({ label, offset, limit })` over Effect RPC at `/rpc`, cached by a `KeyedQuery` per range | `Domain` as a variant Entity read by name; the rows on screen declare what they need and Remote batches it (`foldkit-remote`, `/remote`) |
| A Blocks `VirtualList` with a window scroll container (upstream patches it) and a planner for the next range to fetch | `WindowList`, and `WindowList.windowOf` naming the rows whose names the `VisibleResults` Surface reads |
| Three Blocks Listboxes and two hand-made dialogs for the phone, two Models per control | `foldkit-mixins-ui`'s `Picker` for availability and sort (one Model, one `Chose`), a `ListboxView` dropdown and a `Sheet` for the TLD |
| `icon.ts`, hand-copied Lucide paths | Lucide by name in `icons.json`, written to `src/client/iconData.ts` by `pnpm icons` and drawn with `foldkit-media`'s `Icon.draw` |

The page's styles ride in the document's head, not in the rendered root, so
a page with no second render is styled
([#365](https://github.com/doeixd/foldkit-plus/issues/365)); the 404 status is
set on `SSR.entry`'s result ([#364](https://github.com/doeixd/foldkit-plus/issues/364)).

## Run it

From the repository root:

```bash
pnpm --filter foldkit-example-foldkit-domains-plus dev     # Vite dev server on :5191, pages rendered by the Worker's entry
pnpm --filter foldkit-example-foldkit-domains-plus build   # dist/client and dist/server/fetch.js, prerenders /
npx vitest run examples/foldkit/domains-plus               # unit and Scene tests
npx vitest run --config vitest.e2e.config.ts examples/foldkit/domains-plus  # the dev server in Chromium
npx tsc -b examples/foldkit/domains-plus                   # its types
```

## License

The application is upstream's, MIT, © 2025 Devin Jameson
([`../domains/LICENSE`](../domains/LICENSE)); `src/shared/` and
`src/client/domain/` are upstream's files, copied with only the workspace formatter run over them. The icons are
Lucide's (ISC), named in `icons.json`.
