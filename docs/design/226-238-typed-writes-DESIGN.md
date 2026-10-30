# Typed relation values, refreshing a query, and lists the client can place (#226, #238)

Status: decided (2026-10-30). The parts marked *built* below are in
`foldkit-remote`; the others were checked against `main` and are obsolete.

## Where the issues stand

#238 asked for typed constructors in place of hand-written wire values, and
for a `Query.make` the client can place rows in. #226's remaining items are
the same two. Since they were filed, most of the motivating code went away by
other routes:

| Asked for | At `main` (2026-10-30) | Decision |
| --- | --- | --- |
| `author: \`Account:${me}\`` | `Entity.sets` fills the author from `Expr.viewer`; declared writes build the row | relations in `Remote.patch` are refs (below) |
| `may: { row: …, reasons: {}, … }` by hand | `Guards.may` predicts `may` for a declared write's row (`suppliedOfWrite` in `mutation.ts`) | `May.allowing`: obsolete |
| `likes: ids.map(id => \`Like:${id}\`)` | as `author` | `Remote.refs`: not added |
| `Data.reduce(model, { _tag: 'ConnectionInvalidated', … })` | `Data.refresh` takes a Projection, a Surface, an active entry or record | `Data.refresh` takes a `QueryRef` too |
| `Query.make` with `order` / `member` | bodies cross relations (`Expr.path`, `Expr.exists`, viewer paths) and the client judges them over the store | obsolete; the pattern is documented |

Chirp's `src/` writes no ref key, no `may` and no connection Message. The one
example that still spells a ref key is the kitchen sink's optimistic insert.

## 1. A relation in `Remote.patch` is a ref (built)

```ts
Remote.patch(Post, id, { body, author: Remote.ref(User, me) })   // EntityRef<'User'>
Remote.patch(Post, id, { tags: [Remote.ref(Tag, 't1')] })          // a many relation
Remote.patch(Post, id, { editor: null })                           // an optional one
```

- `Remote.patch`'s values are the field's wire shape, except a relation,
  which takes what the field decodes to: an `EntityRef` (`one`), an
  `EntityRef` or `null` (optional `one`), an array of them (`many`), or a
  `RefPage` (`page`). `Remote.patch` writes each as the ref key the store
  holds, so `EntityPatch.values` stays wire-shaped and nothing downstream
  changes.
- **A string is refused for a relation**, in the type and at runtime. A ref
  key typed by hand was checked only up to its prefix (`'User:'` passed), and
  a value from untyped code was not checked at all. A ref to another Entity
  is refused the same way, naming the field and the target.
- Breaking: `Remote.patch(Post, id, { author: 'User:u1' })` no longer
  compiles. `Remote.patch` exists in v0.35.0. The descriptor's own `patch`
  and `Entity.patch` stay wire-shaped: they are the kernel's, beside
  `Entity.refKey`.
- The relation shapes of a descriptor are read once per descriptor
  (`relationShape` over its fields) and kept in a `WeakMap`.

Rejected: accepting both a ref and a ref key. Two spellings of one value, and
the string one is the one that can be wrong.

## 2. `Data.refresh(model, Query.ref(input))` (built)

```ts
Data.refresh(model, Everyone.ref({}))   // every window of Everyone({})
```

- `RefreshTarget` gains `QueryRef`. Refreshing one invalidates its connection
  (query and input; every window shares it) if the Model has loaded it or its
  query failed, as refreshing a Projection does for the connections it reads.
  `{ failed: true }` invalidates it only if its query failed.
- It marks no row's fields: a ref names no selection. The refetched page
  carries each read's selected fields, as any page does.
- Unlike a Projection, a ref needs no select or window, so an `update` can
  invalidate a list another page reads. An unobserved list is fetched again
  the next time it is read.
- The domain's `refresh` types the ref by its registered queries; a query
  the domain does not register is refused at the type level and at runtime,
  as `Data.query` refuses it.

Rejected: a separate `Data.invalidate`. `Data.refresh` already says "mark due
for the read entries", and one verb for it is enough.

## 3. `May.allowing`: obsolete

A declared write's `may` is predicted from the guard rules. An opaque write
(a `Mutation.make` handler) is unknown to the client on purpose (the
operations plan's *Limits*): its `may` comes with the answer. A constructor
for an allowed `may` would let an application claim a permission the rules
may not grant, and the refusal would come only with the answer.

## 4. `Remote.refs`: not added

With relations taking refs, a many relation is
`ids.map(id => Remote.ref(Like, id))`. A wrapper around `map` adds a name
without removing a mistake.

## 5. `Query.make` with `order` / `member`: obsolete

The proposal let `Query.make` carry an order and a JavaScript membership test
(`member: ({ row, store }) => …`) so the client could place rows in lists
whose filter it could not express. Since then:

- A body follows relations (`Expr.path`, `Expr.exists`, a path from
  `Expr.viewer`), and the client judges it over the rows it holds, placing a
  row where it can follow the path and leaving it to the server where it
  cannot. A follow feed is a body.
- `member` would be a second membership language, run only on the client.
  The server could not compile it and `Law.check` could not hold it to the
  server's answer.
- `order` without `member` places nothing: membership unknown means every
  change invalidates. The `joins` it leaned on was never built.
- remote-drizzle checking `orderBy` against `order` falls with it: a body's
  order is compiled, not checked against a restatement.

What stays is documentation: the choice between `Query.make` and
`Query.define`, and the **body plus server `where`** pattern for a filter
`Expr` cannot state. Its rule: the body must admit no row the client makes
or moves that the server's `where` refuses, since the client places what the
body admits and nothing tells it otherwise until the list is read again.

## Tests

- `patchRef.test.ts`: refs are written as keys for `one`, optional `one`,
  `many` and `page`; a string, a ref to another Entity, and a non-array for a
  many relation are refused at runtime; `@ts-expect-error` for a string, a
  wrong target and a `string[]`.
- `refreshQuery.test.ts`: a ref invalidates every window of its connection
  and the read entry fetches it again; an unloaded connection and an
  unregistered query; `{ failed: true }`; `@ts-expect-error` for a query the
  domain does not register.
- Mutation specs beside each. No Message is added and no prediction changes,
  so `heldValue.test.ts` and `Law.check` are untouched.
