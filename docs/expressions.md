# Expressions: one question, every reader

"Published posts, newest first." "Only the author may edit." "A published post has words." In most applications each rule is written three times: as SQL on the server, as a filter over cached rows in the browser, and as validation in a form. Whenever those copies drift, the page shows rows or allows actions the server rejects.

Foldkit Plus avoids drift by letting you write each rule once as an **expression**: a frozen value built with `Expr` from `foldkit-entity`. Each consumer interprets the exact same value—the database adapter compiles it to SQL, the server evaluates it in memory, and the browser judges the rows it holds. A shared conformance suite holds all interpreters to the same semantics, and any interpreter that lacks a row or operator reports unknown or refuses rather than guessing.

## Where you write an expression and who answers it

| Question you express | Declared with | Interpreted by |
| --- | --- | --- |
| Which rows a list holds and in what order | `Query.where`, `Query.orderBy` | Server SQL; page when placing written rows |
| Which state a row is in | `Entity.refine` | Queries and writes referencing that state |
| What every stored row must hold | `Entity.invariant` | Server writer, SQL `CHECK`, page, and forms |
| Whether a specific write applies now | `Write.update(..., { when })` | Writer `WHERE` clause and page pre-check |
| Who may read or write a row | `foldkit-guard` rule | Server SQL and client `may` hints |
| Reusable domain predicate | `Expr.operator` | Any interpreter supporting its body |

`foldkit-entity` defines the expression language and its reference evaluator. Authority stays with the server: the server decides list membership and commits writes, while client evaluations serve as immediate UI previews replaced when the server responds.

## How three interpreters share one expression

Every `Expr` value is interpreted by three engines depending on where it runs:

1. **SQL compiler (`foldkit-remote-drizzle`):** Translates the expression into parameterized SQLite, Postgres, or D1 queries.
2. **In-memory evaluator (`evaluate`):** Runs the expression over a complete table of rows in memory.
3. **Partial holder judge (`Judge`):** Evaluates the expression over whatever rows and fields the browser currently holds, returning `Known(true | false | unknown)` when decidable or `Unknown(reason)` when a required row or field is missing.

Two rules guarantee that SQL and memory produce identical results:

- **Three-valued SQL logic:** Comparing with `null` yields *unknown*, and rows match only when the predicate evaluates to `true`.
- **Explicit backend parity:** Text ordering declares its collation, `contains` specifies ASCII case folding, and inputs that databases handle inconsistently (strings containing NUL bytes, or `NaN`) fail explicitly.

## A first query and its answer

This example declares a `Post` entity with binary text ordering, builds a `Short` query expression, prints it, evaluates it in memory, and inspects its field dependencies:

```ts
import { Schema } from 'effect'
import { Collation, Entity, Expr, Order, Query, evaluate } from 'foldkit-entity'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    words: Schema.Number,
    publishedAt: Schema.NullOr(Schema.Number),
  }),
).pipe(Entity.annotateMembers({ title: Collation.of(Collation.binary) }))

const Short = Query.from(Post).pipe(
  Query.where(Expr.lt(Post.fields.words, 1000)),
  Query.orderBy(Order.asc(Post.fields.title)),
)

const rows = [
  { id: 'p1', title: 'Notes on the Engine', words: 900, publishedAt: 100 },
  { id: 'p2', title: 'Compilers', words: 2400, publishedAt: null },
  { id: 'p3', title: 'compost', words: 300, publishedAt: 300 },
]

Query.show(Short)
// FROM Post
// WHERE Post.words < 1000
// ORDER BY Post.title ASC

evaluate(Short, {}, rows).map(row => row.id)
// ['p1', 'p3']

Query.dependencies(Short).predicate.map(field => field.key) // ['words']
Query.dependencies(Short).order.map(field => field.key) // ['title']
```

What each call does:

- **`Expr.lt(Post.fields.words, 1000)`** constructs a typed comparison node. Because the right-hand literal inherits the field's type, `Expr.lt(Post.fields.words, 'long')` fails at compile time.
- **`Query.from(...).pipe(Query.where, Query.orderBy)`** describes the Entity, filter predicate, and sort order without binding a table or window size (which Selections and queries add separately).
- **`Query.show`** formats a human-readable summary for debugging.
- **`evaluate`** runs the pure reference interpreter over in-memory rows, returning the same IDs in the same order as `foldkit-remote-drizzle`'s SQL compiler.
- **`Query.dependencies`** lists which fields affect filtering (`words`) vs. ordering (`title`), letting the client tell which edits can move a row in or out of a cached list.
- **`Collation.of(Collation.binary)`** specifies code-point ordering for `title` so SQLite, Postgres, and JavaScript agree (`'Notes on the Engine'` before `'compost'`).

In an application, wrap the body in `Query.define('Short', { under: Schema.Number }, ({ input }) => ...)` from `foldkit-remote`, register `query(Short, { entity })` on the server, and fetch it on the client with `Data.query(Short, { under: 1000 }, { select })`.

## Three interpreters, one answer

[`examples/entity`](../examples/entity/README.md) runs five queries across SQLite, `evaluate`, and `Judge`:

```output
NotEditedBy: posts not edited by an author
  FROM Post
  WHERE not (Post.editor = $editor)
  ORDER BY Post.title ASC
  given {"editor":"a2"}, asked by a visitor
  reads its own row's editor, title
  SQLite ran: select "id", "headline" from "posts" where not ("posts"."editor_id" = ?) order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["a2",101]
  SQLite: p3
  evaluate, every post: p3
  Judge, every row held: p3
  Judge, a page holding Ada and one comment: p1 out, p2 out, p3 in, p4 out
ByAuthorName: posts by an author's name
  FROM Post
  WHERE contains(Post.author.name, $name)
  ORDER BY Post.title ASC
  given {"name":"ada"}, asked by a visitor
  reads its own row's title, and other rows through Post.author.name
  SQLite ran: select "id", "headline" from "posts" where lower((select "authors"."name" from "authors" where "authors"."id" = "posts"."author_id")) like lower(?) escape '\' order by "posts"."headline" collate binary asc, "posts"."id" collate binary asc limit ? ["%ada%",101]
  SQLite: p2, p1
  evaluate, every post: refused, it does not run path
  Judge, every row held: p2, p1
  Judge, a page holding Ada and one comment: p1 in, p2 in, p3 unknown (Author a2 is not held), p4 unknown (Author a3 is not held)
```

Notice three behaviors in that trace:

- **Identical IDs and ordering:** Posts `p1` and `p4` have `editor: null`, so `null = 'a2'` and `not (null = 'a2')` are both unknown, leaving only `p3` in SQLite, `evaluate`, and `Judge`.
- **Binding details stay in the binding:** The SQL compiler maps `title` to the `"headline"` column, compiles relations to subqueries, and appends `"id"` for deterministic pagination.
- **Refusals over guesses:** `evaluate` handles a single table and refuses `ByAuthorName` because it crosses a `path` relation. `Judge` answers for posts whose author (`a1`) it holds and returns `Unknown` naming the missing author for `p3` and `p4`.

Shared conformance tests in `foldkit-entity/conformance` verify mixed-case text, nulls, `%`/`_` wildcards, accents, and stored date formats across SQLite, Postgres, `evaluate`, and `Judge`. For write parity, `Law.check` in `foldkit-remote/testing` verifies client predictions against server commits; see [Checking the prediction against the server](./declared-writes.md#checking-the-prediction-against-the-server).

## The expression language

The snippets below continue `Post` and `rows` from the first example.

<!-- docs-check
import { Derived, type Predicate } from 'foldkit-entity'
// @ts-expect-error the literal's type comes from the field
Expr.lt(Post.fields.words, 'long')
const Counted = Post.pipe(Entity.derived({ commentCount: Derived.make(Schema.Number) }))
// @ts-expect-error a derived member is not an operand
Expr.lt(Counted.derived.commentCount, 3)
const byTitle = Query.orderBy(Order.asc(Post.fields.title))
const ids = (predicate: Predicate) =>
  evaluate(Query.from(Post).pipe(Query.where(predicate), byTitle), {}, rows).map(row => row.id)
-->

### Values: fields, literals, and inputs

A comparison always takes a field on the left and a literal or `Expr.input(key, schema)` placeholder on the right:

```ts
const search = Expr.input('search', Schema.String)
const Found = Query.from(Post).pipe(Query.where(Expr.contains(Post.fields.title, search)), byTitle)

evaluate(Found, { search: 'COMP' }, rows).map(row => row.id) // ['p2', 'p3']
evaluate(Found, { search: '' }, rows).map(row => row.id) // ['p2', 'p1', 'p3']
```

TypeScript checks operand types at the call site:

```ts
// @ts-expect-error a title is text, not a number
Expr.eq(Post.fields.title, 42)
// @ts-expect-error the value's type comes from the left, so the field goes first
Expr.eq('Compilers', Post.fields.title)
// @ts-expect-error `contains` searches text
Expr.contains(Post.fields.words, search)
```

Because `Expr.input` is a symbolic placeholder evaluated later, JavaScript conditionals like `search === '' ? a : b` inspect the placeholder object rather than the runtime string. Express optional filters with `Expr.whenGiven(input, value => predicate)` instead. Values compare in their stored representation, so ISO date strings compare as text.

### Nulls and three-valued logic

Predicates evaluate to `true`, `false`, or `unknown`. Comparisons against `null` yield `unknown`, `not(unknown)` stays `unknown`, and only `true` rows pass a filter:

```ts
const early = Expr.lt(Post.fields.publishedAt, 200)

ids(early) // ['p1']
ids(Expr.not(early)) // ['p3'] — p2 (null) is in neither
ids(Expr.or(Expr.isNull(Post.fields.publishedAt), Expr.not(early))) // ['p2', 'p3']
ids(Expr.eq(Post.fields.publishedAt, null)) // [] — use Expr.isNull
```

Use `Expr.implies(a, b)` (equivalent to `Expr.or(Expr.not(a), b)`) when a rule constrains only rows matching condition `a`:

```ts
ids(Expr.implies(Expr.lt(Post.fields.words, 1000), Expr.gte(Post.fields.publishedAt, 200))) // ['p2', 'p3']
```

Boolean connectives follow SQL: `and` absorbs `false` over `unknown`, `or` absorbs `true` over `unknown`, and `Expr.isNull` / `Expr.isNotNull` always return a definite boolean.

### Comparisons and text collations

`Expr.lt`, `lte`, `gt`, and `gte` compare numbers directly and compare text only when the field or call declares a collation:

```ts
// `title` declares Collation.binary: uppercase orders before lowercase.
ids(Expr.gte(Post.fields.title, 'a')) // ['p3']
// Override per comparison: ASCII case-folded, then code point.
ids(Expr.gte(Post.fields.title, 'a', { collation: Collation.asciiFold })) // ['p2', 'p1', 'p3']
```

| Collation | Behavior | SQLite | Postgres |
| --- | --- | --- | --- |
| `Collation.binary` | Unicode code point order | `BINARY` | `COLLATE "C"` |
| `Collation.asciiFold` | ASCII letters folded, then code point | `NOCASE` | `lower(x COLLATE "C")` |
| `Collation.locale('en-US')` | Database locale ordering | Refused | Server only; client skips order |

Comparing text without a collation throws immediately, naming the field. `Expr.contains(text, search)` folds ASCII case (`É` stays distinct from `é`) and escapes `%` and `_` as literal characters. `Expr.in(field, list)` returns `false` on an empty list. Express range checks by combining `gte` and `lte` with `Expr.and`.

### Sums and differences

`Expr.add(a, b)` and `Expr.sub(a, b)` compute numeric sums and differences from fields, inputs, literals, or nested arithmetic:

```ts
ids(Expr.lt(Expr.add(Post.fields.words, 200), 1000)) // ['p3']
Expr.show(Expr.sub(Post.fields.words, Expr.input('cut', Schema.Number))) // '(Post.words - $cut)'
```

Arithmetic propagates `null` on either operand and runs identically across memory, SQLite, and Postgres within standard integer/double bounds (Postgres raises range errors beyond integer limits; non-numeric operands fail type checking).

### Sorting with `Order`

Use `Order.asc`, `Order.desc`, or `Order.chosen` over fields on the Entity:

```ts
const Newest = Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.publishedAt)))

Query.orderFor(Newest, {}).map(term => `${Expr.show(term.expr)} ${term.direction} nulls ${term.nulls}`)
// ['Post.publishedAt desc nulls first', 'Post.id asc nulls last']

evaluate(Newest, {}, rows).map(row => row.id) // ['p2', 'p3', 'p1']
Query.placement(Newest, {}) // { _tag: 'Placeable' }
```

- **Total ordering:** `Query.orderFor` appends the Entity's `id` automatically so ties and cursors remain deterministic.
- **Null placement:** Ascending puts nulls last and descending puts nulls first unless `{ nulls }` overrides it.
- **Client placement:** `Query.placement` checks whether the browser can position newly created or edited rows locally (`Placeable`) or must ask the server (`NotPlaceable`, for example when ordering by a locale or undeclared text collation).
- **Text sorting:** Declare `Collation.binary` or `Collation.asciiFold` on text sort keys so `evaluate`, SQLite, and Postgres agree.

### Context values: `Expr.viewer` and `Expr.now`

`Expr.viewer(Entity)` evaluates to the current caller's ID for that Entity (or `null` for an unauthenticated visitor), and `Expr.now` evaluates to the current timestamp in milliseconds:

```ts
import { Option } from 'effect'

const Out = Query.from(Post).pipe(Query.where(Expr.lt(Post.fields.publishedAt, Expr.now)), byTitle)

evaluate(Out, {}, rows, { context: { viewer: Option.none(), now: Option.some(200) } }).map(row => row.id)
// ['p1']
```

`RemoteServer.make({ viewer })` and `Remote.make({ viewer })` supply the viewer context automatically. Missing context throws `ContextMissingError`, and queries using `Expr.now` defer list placement to the server clock.

### Relations: links, paths, and `exists`

<!-- docs-check standalone
import { Option, Schema } from 'effect'
import {
  Collation,
  Entity,
  Expr,
  Held,
  Judge,
  Order,
  Query,
  Relation,
  Write,
  evaluate,
} from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
-->

After relating Entities with `Entity.relate`, predicates can traverse links in three ways:

```ts
const AuthorFields = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const CommentFields = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, title: Schema.String, words: Schema.Number, published: Schema.Boolean }),
).pipe(Entity.annotateMembers({ title: Collation.of(Collation.binary) }))

const { Author, Comment, Post } = Entity.relate(
  { Author: AuthorFields, Comment: CommentFields, Post: PostFields },
  {
    Post: { author: Relation.one(AuthorFields), editor: Relation.one(AuthorFields, { optional: true }) },
    Comment: { post: Relation.one(PostFields), author: Relation.one(AuthorFields) },
  },
)
const byTitle = Query.orderBy(Order.asc(Post.fields.title))

// 1. Relation as an operand compares the linked ID.
const Mine = Query.from(Post).pipe(Query.where(Expr.eq(Post.relations.author, Expr.viewer(Author))), byTitle)

// 2. Path traverses a `one` relation (up to 4 hops) to read a target field.
const ByAuthorName = Query.from(Post).pipe(
  Query.where(Expr.eq(Expr.path(Post.relations.author, Author.fields.name), Expr.input('name', Schema.String))),
  byTitle,
)

// 3. Exists checks if at least one child row matches an optional predicate.
const Discussed = Query.from(Post).pipe(
  Query.where(Expr.exists(Comment.relations.post, Expr.eq(Comment.relations.author, Expr.viewer(Author)))),
  byTitle,
)
```

<!-- docs-check
import type { Predicate } from 'foldkit-entity'
// @ts-expect-error a predicate over Comment, in a query from Post
Query.from(Post).pipe(Query.where(Expr.eq(Comment.fields.body, 'x')))
declare const maybeNone: ReadonlyArray<Predicate>
// @ts-expect-error a list that may be empty
Expr.and(...maybeNone)
void [Mine, Discussed]
-->

- **`Expr.path`** follows up to four `one` relations; a `null` or guard-hidden link evaluates to `null`.
- **`Expr.exists`** checks visible pointing rows and always evaluates to `true` or `false` in SQL.
- **Sorting on relations:** `Order.asc(Expr.path(...))` throws at definition time; queries sort on the root Entity's own fields.
- **Cross-row dependencies:** Inspect `Query.dependencies(ByAuthorName).reaches` (which reports `'Post.author.name'`) to invalidate lists when a related Author changes.

SQL compiles `path` into a scalar subquery and `exists` into `EXISTS (...)` filtered by guard rules; `Judge` evaluates both over held client rows.

### Judging partial client caches with `Judge`

Because browsers hold only a subset of rows and fields, `Judge` distinguishes a `null` field from an unfetched field or uncached target row:

```ts
const posts = [
  { id: 'p1', title: 'Notes on the Engine', words: 900, published: true, author: 'a1', editor: null },
  { id: 'p3', title: 'compost', words: 300, published: true, author: 'a2', editor: 'a1' },
]
const page = Held.rows([
  { entity: Post, rows: posts },
  { entity: Author, rows: [{ id: 'a1', name: 'Ada' }], complete: false },
])
const verdict = (id: string) =>
  Option.map(page.row(Post, id), row => Judge.query(ByAuthorName, { name: 'Ada' }, row))

verdict('p1') // some({ _tag: 'Known', truth: true })
verdict('p3') // some({ _tag: 'Unknown', reason: 'Author a2 is not held' })
```

Read verdicts with `Judge.match`. Known verdicts match SQL; `Unknown` leaves uncertain list updates to the next server query rather than guessing. Short-circuit logic still resolves whenever possible (such as `false` in an `and`, or one held matching child in an `exists`).

### Using expressions in invariants, states, writes, and guards

Invariants, `Entity.refine` states, write `when` preconditions, and `foldkit-guard` rules all use the same `Expr` predicates:

```ts
const publishedHasWords = Entity.invariant<typeof Post>(
  'publishedHasWords',
  ({ after }) => Expr.or(Expr.eq(after.published, false), Expr.gt(after.words, 0)),
  { message: 'A published post has words', path: ['words'] },
)
const Checked = Post.pipe(publishedHasWords)

Entity.judge(Checked, {
  after: { id: 'p9', title: 'Untitled', words: 0, published: true, author: 'a1', editor: null },
})._tag // 'Invalid'

const Live = Entity.refine(Post, 'Live', { published: true })
evaluate(Query.from(Live).pipe(byTitle), {}, posts).map(row => row.id) // ['p1', 'p3']

const Publish = Mutation.update('Publish', Post, {
  set: { published: Schema.Literal(true) },
  when: () => Expr.gt(Post.fields.words, 0),
})
Write.reads(Publish.write).map(field => field.key) // ['words']
```

For reusable named predicates across queries and writes, see [Operators](./operators.md).

## When an expression fails or refuses

| Stage | Failure mode | Common examples |
| --- | --- | --- |
| Type check | Compile error at call site | Mismatched field/value type or cross-Entity predicate |
| Definition | Throws naming field or path | Uncollated text comparison, `Order` on a path, >1,000 nodes |
| Server boot | Throws naming query | Reads unmapped column or unbound Entity |
| Evaluation | Refusal with missing item | Missing `Expr.viewer` context, `NaN`, or unsupported operator |
| Browser `Judge` | `Unknown` with reason | Unheld row/field or server-only operator |

Three cases to keep in mind:

- **`Unknown` on the page is safe:** It prevents optimistic logic from showing a row the server would exclude.
- **`ServerOnlyRules` diagnostic:** State invariants compile to SQL `CHECK` constraints via `checkConstraints`, whereas transition invariants (`before` + `after`) are enforced only by the server writer and log `ServerOnlyRules` once at boot (see [`examples/writes`](../examples/writes/README.md)).
- **`Query.unsupported`:** Inspects which operations a query requires that a given interpreter lacks, ensuring interpreters fail loudly instead of silently dropping clauses.

## Limits

`Expr` covers single-row filters, `one`-relation lookups, and child `exists` checks:

- **Aggregates:** Multiplication, division, and aggregates like `COUNT` belong in derived members (`Derived.count`, `Derived.exists`), which act as display fields rather than expression operands.
- **Joins and order:** Predicates traverse `one` links and `exists`; queries sort only by the root Entity's fields (and non-locale collations for client placement).
- **Custom operations:** Extend the language with domain-specific predicates via [Operators](./operators.md).

When a query needs full SQL features outside `Expr`, register a custom server query source; the client simply re-fetches that list after writes.

## Reference

| Function | Purpose | Null / edge behavior |
| --- | --- | --- |
| `Expr.eq(a, b)` | Equality comparison | Unknown if either side is null |
| `Expr.isNull`, `Expr.isNotNull` | Check for null | Always returns true or false |
| `Expr.lt`, `lte`, `gt`, `gte` | Ordering comparison | Unknown if null; text needs collation |
| `Expr.contains(text, search)` | ASCII case-insensitive substring | Unknown if null; escapes `%` and `_` |
| `Expr.in(a, list)` | Membership in literal list | Unknown if `a` null; empty list false |
| `Expr.and`, `Expr.or`, `Expr.not` | Three-valued boolean logic | `not(unknown)` is `unknown` |
| `Expr.implies(a, b)` | Conditional rule (`!a \|\| b`) | True where `a` is false |
| `Expr.add`, `Expr.sub` | Numeric addition/subtraction | Null if either operand is null |
| `Expr.whenGiven(input, fn)` | Optional filter when input present | Skipped when input is null |
| `Expr.input(key, schema)` | Typed runtime parameter | Validated by `schema` |
| `Expr.viewer`, `Expr.now` | Context caller ID and clock | Visitor viewer is null |
| `relation` as operand | Linked Entity ID | Null on empty optional link |
| `Expr.path(relation, end)` | Traverse `one` link to field/exists | Null on null/hidden link |
| `Expr.exists(rel, where?)` | Child row existence check | Always true or false in SQL |
| `Expr.is(Entity, tag, fn?)` | Match variant Entity case | False on other cases |
| `Order.asc`, `desc`, `chosen` | Sort terms over own fields | Nulls last asc, first desc |
| `Query.dependencies(body)` | Fields, inputs, ops, `reaches` | Tracks filter vs. sort fields |
| `Query.placement(body, input)` | Client list-placement check | Returns `NotPlaceable` with reason |
| `Query.unsupported(body, ops)` | Check interpreter support | Lists missing operations |
| `evaluate(body, input, rows)` | In-memory reference evaluator | Missing key treated as null |
| `Judge.query(body, input, row)` | Partial-cache evaluator | Missing key returns `Unknown` |

## Next

- See how Entities, guards, writes, and queries fit together in [One domain declaration](./entity.md).
- Read where rules live and how `Laws.check` verifies them in [Laws](./laws.md).
- Learn the full `Expr` API in the [`foldkit-entity` README](../packages/entity/README.md#saying-something-about-a-row-expr).
