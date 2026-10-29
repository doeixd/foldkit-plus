# What a page pays for a published package (#215)

Status: built (2026-10-29). Eight packages are published one file per source
module; `scripts/test/publishedBuild.test.ts` keeps them so.

## Measured

Production client builds (`vite build`, minified), the workspace packages read
from their `dist` as an installed application reads them, against the same
build reading their source (`foldkit-plus:source`, as every example here
does):

| client entry                   | published, before  | published, after   | source             |
| ------------------------------ | ------------------ | ------------------ | ------------------ |
| Chirp (`examples/chirp`)       | 1,043.0 / 286.0 kB | 1,009.2 / 281.1 kB | 991.3 / 280.7 kB   |
| SSR counter (`examples/foldkit/ssr`) | 464.7 / 142.9 kB | 450.4 / 141.1 kB | 449.6 / 140.9 kB |

(minified / gzipped). What is left between published and source in Chirp is
`foldkit-remote` (about 10 kB rendered), which is still linked.

Of Chirp's entry, by rendered bytes: Effect 531 kB, `foldkit-remote` 332 kB,
Foldkit 322 kB, `foldkit-entity` 166 kB, `foldkit-mixins` 152 kB, the rest
under 60 kB each. No module of the entry is a Node module; the `node:fs` and
`node:crypto` Vite reports come from sql.js in Chirp's in-browser server, a
chunk of its own. Effect's `net/*`, `http/Cookies` and Foldkit's devtools are
in every page through Foldkit's runtime, and are Foldkit's to drop.

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
namespace. `unbundle: true` is not needed once every file is an entry. Each
`package.json` names `dist/*.js` and `dist/*.d.ts`; no subpath changed.

## Not changed

- `foldkit-remote` is still linked; it is next.
- `foldkit-surface`, `-mixins-form`, `-guard`, `-site` and `-metadata`
  measured the same linked or not, or are one module, so they were left.
- A size budget in CI: the test compares each package with its own source,
  which says which package regressed and needs no number kept up to date.
