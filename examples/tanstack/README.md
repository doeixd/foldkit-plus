# A query body on TanStack DB

A spike, not a package: one question, answered by a test. Does a
`foldkit-entity` query body mean the same thing to an engine nobody here
designed?

`foldkit-remote-drizzle` compiles a body to SQL and `foldkit-remote-server`
runs it over rows in memory, and both were written in this repository. This
example compiles the same body to [TanStack DB](https://tanstack.com/db)'s
query builder, a local incremental engine, and runs `foldkit-entity`'s
conformance suite (`foldkit-entity/conformance`) through it.

## Run it

From the repository root:

```bash
npx vitest run examples/tanstack
```

There is no app and no server: `test/conformance.test.ts` is the example.

## What it shows

- **The cases it runs agree.** Each case the interpreter declares it supports
  (`supported` in `src/interpreter.ts`: `eq`, `isNull`, `isNotNull`, `in`) runs
  as a TanStack live query, and its ids come back as the case expects them,
  in order.
- **What it cannot run, it refuses before compiling.** `Expr.contains` is
  declared unsupported: TanStack's `like` has no `ESCAPE`, so a `%` in the
  search would match as a wildcard instead of a percent sign. The interpreter
  checks a body with `Query.unsupported(body, supported)` and throws
  `TanstackCompileError` naming what is missing, rather than answering a
  different question.
- **Collations are honoured or refused.** An order with the `binary`
  collation sorts with TanStack's `lexical` string sort; any other declared
  collation is refused.

## Limits

- It reads one collection: a path, an exists, `Expr.viewer` and `Expr.now` are
  refused.
- `and`, `or`, `not` and comparisons are refused, so it runs a part of the
  kernel only.
- The builder is untyped from the interpreter's side (`any` rows), since a body
  is compiled at run time.

[`examples/livestore`](../livestore) asks the same question of a narrower
engine.
