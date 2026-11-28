# Upgrading across the MetaKit unification (Phases 1–4)

This guide lists every breaking change from unifying expressions, laws, operators, aggregates, and SSR resumption onto `metakit`, ordered by what breaks first when you upgrade.

## 1. `foldkit-entity`: `Laws` moved to `foldkit-entity/laws`

**Compiler error:**
`Module '"foldkit-entity"' has no exported member 'Laws'.`

**Before:**
```ts sketch
import { Entity, Laws } from 'foldkit-entity'
```

**After:**
```ts
import { Entity } from 'foldkit-entity'
import { Laws } from 'foldkit-entity/laws'
```

**Why:** Keeping the static law checker off the main entry stops browser pages from bundling proof code they never run.

## 2. `foldkit-entity`: `Law.*`, `Operators.implement`, and `Evidence.Proven` removed

**Compiler errors:**
- `Module '"foldkit-entity"' has no exported member 'Law'.`
- `Property 'implement' does not exist on type ...`
- `Property 'Proven' does not exist on type ...`

**Before:**
```ts sketch
import { Expr, Law, Operators } from 'foldkit-entity'
const op = Expr.operator('flags.or', ..., [Law.Commutative, Law.within(0, 2147483647)])
const table = Operators.implement(op, (a, b) => a | b)
```

**After:**
```ts
import { Schema } from 'effect'
import * as Operation from 'metakit/operation'
const Flags = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 2147483647 }))
const flagsOr = Operation.define({
  id: 'flags.or',
  version: 1,
  args: [Flags, Flags] as const,
  returns: Flags,
  nulls: 'strict',
  claims: { commutative: true, associative: true, identity: { value: 0, side: 'both' } },
})
const table = Operation.implementations('app', Operation.implement(flagsOr, (a, b) => a | b))
```

**Why:** Custom operations and their algebraic claims now live in one place (`metakit/operation`), checked by `checkOperation` from `metakit/conformance` instead of unverified `Evidence.Proven` tags. `Distributes` and `PreservesCollation` were removed because no reader acted on them; `Law.Inverse` (unary) became binary `claims.invertible`.

## 3. `foldkit-remote/aggregate` moved to `foldkit-remote/maintained`

**Compiler error:**
`Cannot find module 'foldkit-remote/aggregate' or its corresponding type declarations.`

**Before:**
```ts sketch
import { aggregate } from 'foldkit-remote/aggregate'
```

**After:**
```ts
import { Maintained } from 'foldkit-remote/maintained'
```

**Why:** Maintained values now cover lists, `reduce` folds, reverse-indexed `join`s, coverage checks, offline as-of reads, and rescan classification under one subpath.

## 4. `foldkit-ssr/loader` superseded by `foldkit-ssr/binder` and `manifestPlugin`

`foldkit-ssr/loader` and `runtimeChunk` remain available for existing setups, while new progressive-resumption apps should use `Binder.start` (`foldkit-ssr/binder`) and `manifestPlugin` (`foldkit-ssr/vite`). See [Make a page answer before the framework loads](./guides/resume-before-runtime.md) and [Cut script by Message](./guides/cut-script-by-message.md).
