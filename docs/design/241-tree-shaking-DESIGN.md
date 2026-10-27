# One component's worth of `foldkit-mixins-ui` (#241)

Status: built (2026-10-27). `foldkit-mixins-ui` is published one file per
source module; `packages/mixins-ui/test/treeShaking.test.ts` keeps it so.

## The problem

An application that drew only an Avatar shipped most of `foldkit-mixins-ui`,
with `@foldkit/ui` and floating-ui behind it. Chirp's client chunk fell from
354 kB to 237 kB gzipped when it replaced the Avatar with a slot of its own.

## Measured

A page entry holding only what Chirp used:

```ts
import { Style } from 'foldkit-mixins'
import { Avatar, AvatarSlots, Recipes } from 'foldkit-mixins-ui'
import type { HtmlBuilder } from 'foldkit/html'

const style = Style.forSlots(AvatarSlots)(Recipes.Avatar({ color: 'name' }), { name: 'A' })
export const draw = (h: HtmlBuilder<never>) => Avatar.view({ name: 'Ada Lovelace', style }, h)
```

built with Vite 8 in library mode, minified, everything bundled:

| `foldkit-mixins-ui` read as | minified | gzipped | `@foldkit/ui`, floating-ui |
| --- | --- | --- | --- |
| published `dist`, before | 982,642 B | 238,607 B | 155 kB and 43 kB rendered |
| published `dist`, after | 350,078 B | 99,210 B | none |
| workspace source (`foldkit-plus:source`) | 344,650 B | 97,494 B | none |
| no `foldkit-mixins-ui` at all (`Slots` and `Style` only) | 267,703 B | 74,460 B | none |

Split by what the entry touched, before the fix: `Avatar.view` alone was
77,758 B gzipped, and `Recipes.Avatar(...)` alone 218,400 B. The Avatar was
never the cost; reading one recipe off `Recipes` was.

The examples in this repository resolve workspace packages to their source,
where the problem does not occur, which is why no example's build showed it.
An application installing from npm reads `dist`.

## The cause

`sideEffects: false` was already set. The cause was the build.

`tsdown` linked every module into one `dist/index.mjs`, and rolldown writes an
`export * as Recipes from './recipes/index.js'` it links as an object:

```js
var recipes_exports = /* @__PURE__ */ __exportAll({
  Accordion: () => Accordion,
  Alert: () => Alert,
  // ...every recipe
})
```

A page that reads `Recipes.Avatar` keeps that object, and each getter keeps
the recipe it returns, its slot contract, and the `@foldkit/ui` component
behind it. A consumer's bundler cannot drop one property of an object; it can
drop an ES module namespace member it never reads. `Avatar` itself was cheap
for the same reason in reverse: its namespace's getters reach only
`avatar.ts`'s own bindings.

`unbundle: true` alone (one output file per module, still linked) kept the
`__exportAll` objects and measured 224,005 B gzipped.

## The fix

`packages/mixins-ui/tsdown.config.ts`:

- every source file is an entry (`src/**/*.ts`), written beside the others
  (`unbundle`);
- relative imports are external (`neverBundle: [/^\.\.?\//, ...]`), so
  rolldown never links two of the package's modules, and
  `export * as Recipes from './recipes/index.js'` reaches `dist` as written;
- files are written `.js` (`fixedExtension: false`), the extension the
  source's own specifiers name.

`package.json`'s single `.` export now points at `dist/index.js` and
`dist/index.d.ts`. No public name changed; `Recipes.Avatar` stays the API.

## Rejected

- **Per-component subpaths** (`foldkit-mixins-ui/avatar`). With the namespaces
  kept, the root already tree-shakes to the source's result, so subpaths would
  be a second way to import the same thing.
- **Recipes as separate named exports** (`avatarRecipe`). Breaks every
  application and the docs for a cost the build caused.
- **Building with `tsc`.** It also keeps the namespaces, but every package here
  builds with `tsdown`, and `tsc -p` against a composite project with
  references reads stale declarations (AGENTS.md).

## The guard

`packages/mixins-ui/test/treeShaking.test.ts` builds the package with its own
`tsdown.config.ts` into a temporary directory, bundles the Avatar entry above
against it with Vite, and asserts that no module of `@foldkit/ui` or
floating-ui, and no Popover file, is kept. The same walk over
`export * as UI from 'ui'` must find `@foldkit/ui`, so the check can see it.
`treeShaking.mutations.ts` removes the relative-external rule (the Popover
files come back) and the `.js` extension (the page no longer builds); both are
killed.

## Not done here

- Other packages built by one linked `tsdown` entry with `export * as` over a
  barrel may carry the same cost. `foldkit-mixins` measured close to its source
  here (53,693 B against 49,895 B rendered), so it was left alone.
- #215's other findings (Foldkit's devtools in production, Yielded's
  `HttpClient` on every page) belong to Foldkit and Yielded Auth.
