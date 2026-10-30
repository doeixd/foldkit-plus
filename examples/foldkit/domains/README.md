# Foldkit Domains (upstream copy)

A domain-search page modelled on Vercel Domains: type a name, see it under 556
extensions, with sample prices and availability loaded progressively from a
same-origin Effect RPC backend, a virtualized list of every result, filters, a
sort, and a demo cart. The page is rendered on the server, and the search box
takes typing before the script arrives.

This folder is **upstream's application, copied unchanged** from
[foldkit/foldkit-domains](https://github.com/foldkit/foldkit-domains) so that a
Foldkit Plus reimplementation can be compared against it, screen by screen and
test by test. It is not a port: no Foldkit Plus package is used here, and the
other folders under [`examples/foldkit`](../README.md) are the ports. The plan
for reimplementing it with Foldkit Plus is
[`docs/design/foldkit-domains-PLAN.md`](../../../docs/design/foldkit-domains-PLAN.md).

| | |
| --- | --- |
| Source | <https://github.com/foldkit/foldkit-domains> |
| Commit | `c3041350707e69111d0d8137aed1dac6e03e5765` (2026-10-30, "fix: preserve page position when sorting domains") |
| License | MIT, © 2025 Devin Jameson ([`LICENSE`](./LICENSE), kept as upstream ships it) |
| Third-party | Lucide icons, ISC and MIT ([`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)) |
| Upstream's README | [`UPSTREAM-README.md`](./UPSTREAM-README.md); its guides are in [`docs/`](./docs) |

Its styling is upstream's too: Tailwind 4 and the hand-written
`src/client/styles.css`. That is not how code in this repository is styled
(views draw through `foldkit-mixins` Slots, with no CSS files), and it stays
here only because this is a reference copy, not our code. For the same reason
the workspace's formatter skips the copied files (`.prettierignore`), so they
still diff cleanly against upstream.

## Run it

From the repository root:

```bash
pnpm --filter foldkit-example-foldkit-domains dev       # Vite dev server, SSR and /rpc included
pnpm --filter foldkit-example-foldkit-domains build     # dist/client + dist/server/fetch.js, prerenders /
pnpm --filter foldkit-example-foldkit-domains preview   # the built Worker in local workerd (wrangler)
npx vitest run examples/foldkit/domains                 # upstream's Story, Scene and RPC tests
npx tsc -p examples/foldkit/domains                     # its types
```

`pnpm e2e` runs `e2e/dev.e2e.ts`, added here: it starts the dev server, types a
search into Chromium and waits for priced results, and checks that an unknown
path answers 404. Upstream's own browser suites (`e2e/*.spec.ts`, Playwright,
Chromium and WebKit) run from this folder:

```bash
pnpm exec playwright install chromium webkit
pnpm --filter foldkit-example-foldkit-domains test:e2e          # build + workerd preview on :5180
pnpm --filter foldkit-example-foldkit-domains test:e2e:dev      # dev server on :5181
pnpm --filter foldkit-example-foldkit-domains test:e2e:worker   # adds the Worker RPC fixture on :5183
```

On 2026-10-30, `test:e2e` passed all 67 Chromium tests here; three axe scans
timed out at 30 s under full parallel load and passed run alone
(`--workers=1`). WebKit was not run.

## What changed to run it here

The application code (`src/`, `e2e/*.spec.ts`, `public/`) is upstream's,
byte for byte. What changed is around it:

- **Foldkit stays on upstream's preview.** The app is written against
  Foldkit's unreleased Blocks and Layers API (`Block`, `KeyedQuery`,
  `DialogBlock`, `Listbox.makeBlock`, `VirtualList.makeBlock`,
  `foldkit/bindingInit`), published as `0.169.0-canary.90746b32d2ca`.
  Foldkit 0.170.0, which the workspace uses, has none of it, so moving to
  0.170 is a rewrite, not a version bump; that rewrite is the plan above.
  `foldkit`, `@foldkit/ui`, `@foldkit/devtools` and `@foldkit/vite-plugin`
  keep upstream's exact canary pins, and the workspace now holds two Foldkits
  (this folder's and everyone else's 0.170.0).
- **Effect 4.1 instead of 4.0.6.** The workspace keeps one copy of each
  Effect package, so this folder takes `effect` and
  `@effect/platform-browser` `^4.1.0`. The canaries declare `4.0.0 || 4.0.6`
  as their peer, so pnpm warns; the tests, the build and the browser suite pass
  on 4.1. One break needed a patch: the preview Vite plugin reads `Crypto`
  from `effect`, which 4.1 moved to `effect/crypto` as `SecureRandom`.
  `patches/@foldkit__vite-plugin@0.28.0-canary.90746b32d2ca.patch` makes the
  same change the released `@foldkit/vite-plugin` 0.29.0 made. Upstream's own
  `@foldkit/ui` patch (VirtualList scroll anchoring) is kept. Both are listed
  under `patchedDependencies` in the root `pnpm-workspace.yaml`.
- **`parse5` is a direct dependency.** The build prerenders `/` by importing
  the emitted `dist/server/fetch.js`, which imports `parse5` (Foldkit's
  server renderer) from this folder; under the workspace's install nothing
  there resolves it, so the build failed until the folder declared it.
- **TypeScript 7.0.2** (upstream 7.1.0-beta), with the workspace's base
  config plus upstream's own settings (`verbatimModuleSyntax` off, `allowJs`,
  `checkJs`, `erasableSyntaxOnly`). The project is checked alone with
  `tsc -p`, not as a reference of the root `tsc -b`: a referenced project
  emits declarations, and the preview's types cannot be named from outside
  its package (TS2883), which upstream never meets because it checks with
  `noEmit`. The root `pnpm typecheck` and `typecheck:force` run it after
  `tsc -b`.
- **Tests run from the root as their own Vitest project.** Upstream keeps its
  tests beside the source and runs them in happy-dom with Foldkit's Vitest
  setup; the root `vitest.config.ts` lists this folder's `vitest.config.ts` as
  a project (named `foldkit-domains`) rather than moving the files into
  `test/`.
- **Left out:** the `repos/foldkit` subtree (7,194 files of Foldkit's source
  at the preview commit), `infra/` (the Alchemy deployment to
  domains.foldkit.dev), `.github/` CI, the lint setup (oxlint,
  `@effect/tsgo`, `@foldkit/oxlint-plugin`), the agent files (`AGENTS.md`,
  `FOLDKIT.md`, `.mcp.json` and `@foldkit/devtools-mcp`),
  `scripts/generate-social-assets.ts` (it needs `sharp`; the generated images
  in `public/` are kept), upstream's lockfile and workspace file, and the
  `engines` field (Node ≥ 24.11.1; the workspace pins Node 22.23.4, which
  builds and tests it). The package scripts that served those (`lint`,
  `format`, `plan`, `deploy`, `dev:cloudflare`, `generate:social`) went with
  them. Upstream's `docs/` still mention them.
