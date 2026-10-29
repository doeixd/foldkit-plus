# What a page pays for a published package (#215)

Status: built (2026-10-29). Twenty-four packages are published one file per
source module; `scripts/test/publishedBuild.test.ts` keeps them so.

## Measured

A page that reads a small part of a package, built minified against the
package's source, its linked build and its build one file per module (bytes
the page keeps from the package):

| package             | page reads          | source  | linked  | per file |
| ------------------- | ------------------- | ------- | ------- | -------- |
| `foldkit-remote`    | `beginOptimistic`   | 1.6 kB  | 350 kB  | 1.6 kB   |
| `foldkit-entity`    | `Collation.binary`  | 1.9 kB  | 73 kB   | 1.9 kB   |
| `foldkit-sync`      | `indexedDb`         | 5.8 kB  | 15.6 kB | 5.9 kB   |
| `foldkit-richtext`  | `decodeDocument`    | 6.6 kB  | 21.9 kB | 6.6 kB   |
| `-mixins-data-grid` | `GridLegend`        | 14.0 kB | 25.0 kB | 14.1 kB  |
| `foldkit-builder`   | `editWords`         | 1.2 kB  | 5.1 kB  | 1.3 kB   |
| `foldkit-surface`   | `MessageSet`        | 1.7 kB  | 2.0 kB  | 1.7 kB   |

(`remote` and `entity` unminified; the rest minified.) Every package in the
test keeps more than 5% over its source when linked again; its mutation spec
relinks each.

Production client builds (`vite build`, minified / gzipped), the workspace
packages read from their `dist` as an installed application reads them,
against the same build reading their source:

| client entry                         | all linked         | eight per file     | 24 per file        | source             |
| ------------------------------------ | ------------------ | ------------------ | ------------------ | ------------------ |
| Chirp (`examples/chirp`)             | 818.3 / 266.0 kB   | 805.6 / 262.2 kB   | 805.6 / 262.4 kB   | 805.6 / 262.1 kB   |
| SSR counter (`examples/foldkit/ssr`) | 425.7 / 140.7 kB   | 421.7 / 139.3 kB   | 421.7 / 139.3 kB   | 421.6 / 139.1 kB   |

These are built without `foldkit:view-identity`. Foldkit's Vite plugin brands
each view function with its module's path, but skips `node_modules`, so an
installed application carries no brand for a package while a workspace build
reading `dist` does, for every function, with paths that differ between a
linked chunk (`condition-DheT5fC0.mjs`) and a file (`condition.js`). Branded,
Chirp read 1,031.5 kB from source and moved with the length of those paths;
the figures this note first gave (1,043.0 to 1,009.2 kB) were partly that.

Chirp and the counter read nearly all of the packages that moved second
(`foldkit-remote` above all), so a linked build cost them nothing more; the
gain is in applications that read a part, as the table above shows. The
counter's and Chirp's published entries are within 0.3 kB gzipped of source;
the difference is the import boundaries between files.

Of Chirp's entry, by rendered bytes: Effect 543 kB, Foldkit 329 kB,
`foldkit-remote` 259 kB, `foldkit-mixins` 123 kB, `foldkit-entity` 115 kB, the
application 46 kB, the rest under 40 kB each. No module of the entry is a Node
module; the `node:fs` and `node:crypto` Vite reports come from sql.js in
Chirp's in-browser server, a chunk of its own. Effect's `net/*`,
`http/Cookies` and Foldkit's devtools are in every page through Foldkit's
runtime, and are Foldkit's to drop.

## The cause

`sideEffects: false` lets a bundler drop a whole file it reads nothing from. A
package linked by `tsdown` into one file per entry has no such files: what a
module runs at its top (a `Schema.Struct(...)` call, a `Data.taggedEnum()`)
stays in the page whether or not the page reads that module. And an
`export * as` over a linked module becomes an object whose getters keep every
member (#241). A page reading `Collation.binary` kept 72,897 B of
`foldkit-entity`'s build against 1,875 B of its source; `Input` kept 55,692 B
of `foldkit-form`'s against 8,831 B.

## The fix

Every source file is an entry (`entry: ['src/**/*.ts']`), written `.js`
beside the others (`fixedExtension: false`, the extension the source's own
specifiers name). Packages with `export * as` (`mixins`, `bundle`, `media`,
`primitives`) also leave relative imports as written (`neverBundle:
[/^\.\.?\//, ...]`), so the namespace reaches `dist` as an ES module
namespace. The sixteen moved second all leave relative imports as written:
without it, `mixins-crud`'s per-file build kept as much as its linked one.
`unbundle: true` is not needed once every file is an entry. Each
`package.json` names `dist/*.js` and `dist/*.d.ts`; no subpath changed.

## Not changed

- `foldkit-guard`, `-remote-server`, `-mixins-form`, `-agent`, `-cms`,
  `-richtext-dom`, `-site` and `-metadata` measured the same linked or not
  (within 2%, or worse one file per module), or are one module, so they were
  left. `-agent-*`, `-auth`, `-cms-drizzle`, `-react-codegen`, `-mirror`,
  `-form-recipes`, `-bundle-surface` and the `richtext-code` packages measured
  the same, or run only on a server or at build time.
- A size budget in CI: the test compares each package with its own source,
  which says which package regressed and needs no number kept up to date.
- The test measures minified pages: unminified, a published module's leading
  doc comment, which the source build drops, was 11% of `mixins-builder`'s
  page.
