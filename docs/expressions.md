# Expressions: one question, every reader

"Published posts, newest first." "Only the author may edit." "A published post
has words." Each is a statement about a row, and in most applications each is
written several times: as SQL on the server, as a filter over the rows the page
already holds, as a check in a form. The copies drift, and the page then shows
something the server will not say.

In Foldkit Plus such a statement is written once, as an **expression**: a
frozen value built with `Expr` from `foldkit-entity`. Building one runs
nothing. Each party that needs the answer interprets the same value: the
database adapter compiles it to SQL, a server holding rows in memory evaluates
it, and the page judges the rows it holds by it. A shared suite of cases holds
those interpreters to one meaning, and one that cannot answer says so instead
of guessing.

## Where you write one, and who answers it

| You are saying | Declared with | Answered by |
| --- | --- | --- |
| Which rows a list holds, and in what order | `Query.where`, `Query.orderBy` | the server's SQL; the page, to place a row it wrote |
| Which state a row is in | `Entity.refine` | whoever reads the state: a query, a write |
| What every stored row holds | `Entity.invariant` | the server's writer where it commits; a `CHECK`; the page and a form, before sending |
| Whether this write applies now | `Write.update(…, { when })` | the writer's `WHERE`; the page, before sending |
| Who may read or write a row | a rule of `foldkit-guard` | the server, in SQL; the page, as a hint |
| A question worth naming | `Expr.operator` | whoever runs the body that calls it |

`foldkit-entity` owns the language and its reference meaning. It owns no rows
and fetches none: an expression is not a query against a database, and holding
one grants nothing. Authority stays where it was. The server decides which rows
a list has and whether a write lands; what the page works out from the same
expression is a display or a hint, replaced by the server's answer when it
arrives.

## The mental model

```text
                      Expr  (a frozen value; says, runs nothing)
                        |
      +-----------------+------------------+
      v                 v                  v
 compiled to SQL    evaluate           Judge
 remote-drizzle     every row of       the rows a holder has,
 SQLite, Postgres   one table, in      some rows and some fields
 D1                 memory             of them
      |                 |                  |
      +---------+-------+                  v
                v                Known(true | false | unknown)
        the same rows,           or Unknown(why): never a guess
        in the same order
```

Two rules make "the same" checkable:

- **It follows SQL, not JavaScript.** A comparison with a null is *unknown*,
  and a row is kept only when its predicate is true.
- **Whatever two backends would answer differently is said in the expression
  or refused.** How text orders is declared, `contains` states its case rule,
  and a value no two databases agree on (text holding a NUL, `NaN`) refuses the
  run.

## Sixty seconds

```ts
import { Schema } from 'effect'
import { Collation, Entity, Expr, Order, Query, evaluate } from 'foldkit-entity'

const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    words: Schema.Number,
    // Null while the post is a draft.
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

### What the calls mean

- **`Expr.lt(Post.fields.words, 1000)`** builds a predicate node and reads
  nothing. The field is a reference, the `1000` becomes a literal, and the
  literal's type comes from the field: `Expr.lt(Post.fields.words, 'long')`
  does not compile.
- **`Query.from(…).pipe(Query.where, Query.orderBy)`** is a body: an Entity,
  the predicates every row must hold, and an order. It names no table and
  opens no connection. It also says nothing about which fields to read (a
  Selection does) or how many rows (the reader's window does).
- **`Query.show`** prints a body for a person. It is not SQL and no interpreter
  reads it.
- **`evaluate`** is the reference interpreter: pure, over rows you hand it.
  `foldkit-remote-drizzle` compiles the same body to SQL, and the answer is
  the same ids in the same order.
- **`Query.dependencies`** says what the body reads and in which role: a change
  to `words` can move a row in or out of the list, a change to `title` can move
  it within. This is how a page knows which edits can touch which lists.
- **`Collation.of(Collation.binary)`** says how `title` orders. `'compost'`
  comes last because, by code point, every capital orders before every
  lower-case letter. Left unsaid, SQLite, Postgres and JavaScript each order
  text their own way.

In an application the body is declared with a name and an input, and both
sides import it: `Query.define('Short', { under: Schema.Number }, ({ input }) =>
…)` from `foldkit-remote`. The server registers it
(`query(Short, { entity })` from `foldkit-remote-drizzle`) and the page reads it
(`Data.query(Short, { under: 1000 }, { select })`, with a Selection of what
each row shows). The body is the same value in both.

## Three interpreters, one answer

[`examples/entity`](../examples/entity/README.md) asks five bodies of each
interpreter and prints what each said:

```bash
pnpm --filter foldkit-example-entity language
```

```text
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

Read three things in it:

- **The same ids, in the same order,** from SQLite and from memory. Two posts
  with no editor (`p1`, `p4`) are missing from the first answer on every line:
  `null = 'a2'` is unknown, and so is its `not`.
- **The compiler wrote what the body left to it** and nothing it decided for
  itself: the column a field is stored in (`title` is `headline`), the
  subquery a path becomes, the id that makes the order total.
- **An interpreter that cannot answer says so.** `evaluate` is handed one
  table's rows, so it refuses a body that reads another table by naming the
  operation. `Judge`, holding one author of three, answers for the posts it can
  and says *unknown* for the rest, with the reason.

What keeps them equal is tested, not assumed:

- `foldkit-entity/conformance` is a suite of bodies, rows and expected ids,
  chosen to make interpreters disagree (mixed case, nulls, `%` and `_`,
  accents, a date whose stored form differs from its value). `evaluate`,
  Remote's own store, and the SQL compiler on SQLite and on Postgres run its
  cases over one table; the SQL compiler and `Judge` run its cases over
  paths and exists, `Judge` again over holders with rows and fields missing.
  An interpreter written elsewhere can import and run the same cases.
- The example's `test/language.test.ts` generates rows and inputs from a seed
  and holds SQLite, `evaluate` and `Judge` to one answer for each, then checks
  that a `Judge` holding half the rows is never wrong where it says it knows.
  `test/language.mutations.ts` breaks each interpreter in turn and the test
  goes red.
- For writes, `Law.check` from `foldkit-remote/testing` sends one write
  through a page and through the server, and compares what the page showed
  while it was pending with what the database then holds. See
  [Declared writes](./declared-writes.md#checking-the-prediction-against-the-server).

To see it in a browser, run `pnpm --filter foldkit-example-entity page`. It
opens `language.html`, where you choose a declared body and see its compiled
statement, the rows SQLite answers (SQLite runs in the page), `evaluate`, and
`Judge` holding everything and holding part, each refusal in its own words.

## The language

The rest of this guide is the language itself, a part at a time. The snippets
continue the `Post` above.

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

### Values: fields, literals, inputs

A comparison takes a field on the left and a value on the right. A plain value
becomes a literal; `Expr.input(key, schema)` is a placeholder for a value the
run is given.

```ts
const search = Expr.input('search', Schema.String)
const Found = Query.from(Post).pipe(Query.where(Expr.contains(Post.fields.title, search)), byTitle)

evaluate(Found, { search: 'COMP' }, rows).map(row => row.id) // ['p2', 'p3']
evaluate(Found, { search: '' }, rows).map(row => row.id) // ['p2', 'p1', 'p3']
```

The types are checked where the expression is written, so a mistake is an
error in the editor and not a list that never matches:

```ts
// @ts-expect-error a title is text, not a number
Expr.eq(Post.fields.title, 42)
// @ts-expect-error the value's type comes from the left, so the field goes first
Expr.eq('Compilers', Post.fields.title)
// @ts-expect-error `contains` searches text
Expr.contains(Post.fields.words, search)
```

An input is a placeholder, not a value. A body is built once, so there is
nothing to branch on: `search === '' ? a : b` over an `InputExpr` is always
truthy. Say the question as a comparison instead. Everything contains the empty
string, so `Found` above is "no filter" when nothing is typed, and
`Expr.whenGiven(input, value => predicate)` applies a filter only when its
input is not null.

A value is compared in its **stored** form. A date kept as an ISO string is
text to the language, and compares as text.

### Null, and the three values

A predicate over a row is true, false or unknown. A comparison with a null is
unknown, a row is kept only when its predicate is true, and `not` of unknown is
unknown.

```ts
const early = Expr.lt(Post.fields.publishedAt, 200)

ids(early) // ['p1']
ids(Expr.not(early)) // ['p3']: the draft, p2, is in neither
ids(Expr.or(Expr.isNull(Post.fields.publishedAt), Expr.not(early))) // ['p2', 'p3']
ids(Expr.eq(Post.fields.publishedAt, null)) // []: ask with isNull
```

`and` takes false over unknown and `or` takes true over it, as SQL does.
`Expr.isNull` and `Expr.isNotNull` always have an answer. This is the place
JavaScript intuition goes wrong most often: "everything except X" over a
column that can be null must say what it means for the nulls.

### Comparisons and text

`Expr.lt`, `lte`, `gt` and `gte` order two values. Numbers compare as numbers.
Text compares only under a collation both sides of the wire can honour:

```ts
// `title` declares Collation.binary: capitals before lower case.
ids(Expr.gte(Post.fields.title, 'a')) // ['p3']
// A term may name another: ASCII case folded, then by code point.
ids(Expr.gte(Post.fields.title, 'a', { collation: Collation.asciiFold })) // ['p2', 'p1', 'p3']
```

| Collation | Means | SQLite | Postgres |
| --- | --- | --- | --- |
| `Collation.binary` | code point order | `BINARY` | `COLLATE "C"` |
| `Collation.asciiFold` | ASCII letters folded, then code point | `NOCASE` | `lower(x COLLATE "C")` |
| `Collation.locale('en-US')` | the database's own | refused | the server's; a client never orders by it |

Comparing text with no collation declared throws where the comparison is
written, naming the field. `Expr.contains` is a search: case-insensitive for
ASCII letters only (`É` does not match `é`), with `%` and `_` read as
characters. `Expr.in(field, list)` is SQL's `in`: an empty list matches no row.
There is no `between`; write the two comparisons under `Expr.and`.

### Order

Order terms are `Order.asc` and `Order.desc` over the row's own fields.
`Order.chosen` maps a sort the reader picked to a field.

```ts
const Newest = Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.publishedAt)))

Query.orderFor(Newest, {}).map(term => `${Expr.show(term.expr)} ${term.direction} nulls ${term.nulls}`)
// ['Post.publishedAt desc nulls first', 'Post.id asc nulls last']

evaluate(Newest, {}, rows).map(row => row.id) // ['p2', 'p3', 'p1']
Query.placement(Newest, {}) // { _tag: 'Placeable' }
```

- **Every order is total.** `Query.orderFor` ends on the Entity's id, so rows
  with equal keys come out one way everywhere, and a page of results has a
  stable cursor.
- **Where nulls go is part of the term**: last ascending and first descending,
  unless `{ nulls }` says otherwise.
- **`Query.placement` says whether a client can order as the server does.**
  When it can, a page puts a row it just wrote where the list will have it,
  with no request. `NotPlaceable` carries the reason (a locale collation, text
  with none declared, no order at all), and the list is the server's to say.

### Who asks, and when

`Expr.viewer(Entity)` is whoever asks, as that Entity's id. `Expr.now` is the
time in milliseconds. Neither is an input: each interpreter reads them from
the context it is given.

```ts
import { Option } from 'effect'

const Out = Query.from(Post).pipe(Query.where(Expr.lt(Post.fields.publishedAt, Expr.now)), byTitle)

evaluate(Out, {}, rows, { context: { viewer: Option.none(), now: Option.some(200) } }).map(row => row.id)
// ['p1']
```

A server gives them from `RemoteServer.make({ viewer })` and its clock; a page
gives the viewer from `Remote.make({ viewer })`. A visitor's viewer is null, so
a comparison with it holds of no row. A run with no context at all refuses the
body (`ContextMissingError`) rather than reading a visitor. A page has no
reading of the server's clock, so a list over `Expr.now` is the server's to
say.

### Other rows: links, paths and exists

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
-->

Declare relations with `Entity.relate`, and a predicate can read past its own
row in three ways:

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

// 1. A link is an operand: the id a `one` relation points at, null where an optional one points nowhere.
const Mine = Query.from(Post).pipe(Query.where(Expr.eq(Post.relations.author, Expr.viewer(Author))), byTitle)

// 2. A path reads a field of the row a `one` relation points at.
const ByAuthorName = Query.from(Post).pipe(
  Query.where(Expr.eq(Expr.path(Post.relations.author, Author.fields.name), Expr.input('name', Schema.String))),
  byTitle,
)

// 3. An exists asks whether some row points here: a Comment, through its `post`, that is the viewer's.
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

- A path follows `one` relations only, at most four. Through a null link, or
  to a row the reader may not see, it reaches no row and its field reads null.
- An exists names the pointing edge (a `one` relation of the other Entity) and
  an optional filter over the pointing row's own fields. Only rows the reader
  may see count. In SQL it is never unknown.
- A list does not order by a path or a link: `Order.asc(Expr.path(…))` throws
  where it is written.

What a path or an exists reads lies in other rows, so it is not among the
body's `fields`. It is in `reaches`:

```ts
Query.dependencies(ByAuthorName).predicate // []
Query.dependencies(ByAuthorName).reaches.map(reach => Expr.show(reach)) // ['Post.author.name']
```

Anything that asks "can this change touch this body?" must read `reaches` as
well as `fields`. A post whose author is renamed leaves `ByAuthorName` without
any field of the post changing.

SQL compiles a path to a scalar subquery and an exists to `exists (…)`, each
under what the reader may see of the table reached. `evaluate`, which is handed
one table's rows, refuses both. `Judge` follows them through what a holder has.

### What a holder knows: `Judge`

A server's database holds every row, so every question has an answer there. A
page holds what it was sent. `evaluate` reads a missing key as null, which is
right for the first and wrong for the second: "this field is null" and "I was
never sent this field" are different facts. `Judge` keeps them apart.

```ts
const posts = [
  { id: 'p1', title: 'Notes on the Engine', words: 900, published: true, author: 'a1', editor: null },
  { id: 'p3', title: 'compost', words: 300, published: true, author: 'a2', editor: 'a1' },
]
const page = Held.rows([
  { entity: Post, rows: posts },
  // Ada is held; this holder may lack other authors.
  { entity: Author, rows: [{ id: 'a1', name: 'Ada' }], complete: false },
])
const verdict = (id: string) =>
  Option.map(page.row(Post, id), row => Judge.query(ByAuthorName, { name: 'Ada' }, row))

verdict('p1') // some({ _tag: 'Known', truth: true })
verdict('p3') // some({ _tag: 'Unknown', reason: 'Author a2 is not held' })
```

A verdict is `Known` or `Unknown`; read it with `Judge.match`. Known is what
SQL would answer over the same rows. Unknown means the answer rests on a row or
field the holder lacks or may not see, or on something only the server runs,
and it is never rounded to a yes or a no. What can be decided anyway is: a
false operand settles an `and`, a held witness settles an exists.

This is what `foldkit-remote` runs over its store. A row a pending write
changes is placed in or taken out of a list where the verdict is known; where
it is unknown the page does not guess: the list is left for the server to
answer again.

### The same language, in the other declarations

An invariant, a state, a precondition and a guard rule are predicates like any
query's. Only who interprets them, and what a "no" is called, differ.

```ts
// What every stored post holds. `after` is the row a write would leave.
const publishedHasWords = Entity.invariant<typeof Post>(
  'publishedHasWords',
  ({ after }) => Expr.or(Expr.eq(after.published, false), Expr.gt(after.words, 0)),
  { message: 'A published post has words', path: ['words'] },
)
const Checked = Post.pipe(publishedHasWords)

Entity.judge(Checked, {
  after: { id: 'p9', title: 'Untitled', words: 0, published: true, author: 'a1', editor: null },
})._tag // 'Invalid'

// A state, named once: a query can ask for it, and a write can start from it or leave it.
const Live = Entity.refine(Post, 'Live', { published: true })
evaluate(Query.from(Live).pipe(byTitle), {}, posts).map(row => row.id) // ['p1', 'p3']

// When a write applies: compiled into the UPDATE's WHERE, so it is checked where it commits.
const Publish = Write.update(
  Entity.input(Post, Schema.Struct({ id: Schema.String, published: Schema.Literal(true) })),
  { id: 'id', when: () => Expr.gt(Post.fields.words, 0) },
)
Write.reads(Publish).map(field => field.key) // ['words']
```

A guard rule is the same again, with the principal's fields as its inputs
(`guard.row(Post, user => Expr.eq(Post.relations.author, user.id))`). Each of
these has its own guide: [Laws](./laws.md) for where a rule goes and what each
refuses as, [Declared writes](./declared-writes.md) for writes, and
[Auth and Guard](./auth-and-guard.md) for rules. A predicate used in several
places can be given a name with `Expr.operator`; see [Operators](./operators.md).

## When it cannot be said, or cannot be answered

A refusal lands as early as it can be known, and names what was refused.

| When | What | Example |
| --- | --- | --- |
| In the editor | a type error at the mistake | a value of the wrong type; a field on the right; a predicate over another Entity piped into a query; a list that may be empty spread into `Expr.and` |
| Where the expression is built | a throw naming the field or path | text compared with no collation; an order by a path; more than 1,000 nodes |
| Where a server registers it | a throw naming the query | a body that reads a field its table does not store, or reaches an Entity not bound beside it |
| When it runs | a refusal of the run | no context for `Expr.viewer`; text holding a NUL, or `NaN`; an operation the interpreter does not run |
| On the page | `Unknown`, with the reason | a row or field not held; a filter only the server applies |

Three of these are easy to mistake for bugs:

- **A page that says "unknown" is correct.** It holds part of the data. The
  alternative is a list that shows a row the server would leave out.
- **A database cannot hold every rule.** `checkConstraints` compiles an
  invariant over one row to a `CHECK`. An invariant that reads the row before
  a write (`before`) has no `CHECK` form, so only writes through the declared
  writer hold it, and the writer reports that once as a `ServerOnlyRules`
  diagnostic. [`examples/writes`](../examples/writes/README.md) prints it.
- **An interpreter must refuse what it does not run.** `Query.unsupported(body,
  operations)` names what a body needs that an interpreter lacks. One that
  skips a `contains` it cannot compile answers a different question, and every
  test of what it does support still passes.

## Limits

The language says which rows, in which order, and whether a row holds. It does
not:

- compute a value to show. There is no arithmetic and no aggregate in a
  predicate; a count or a lookup over other rows is a derived member
  (`Derived.count`, `Derived.exists`), and a derived member is not an operand;
- join. A predicate reads its own row, rows reached through `one` relations,
  and whether a pointing row exists;
- order by another row's value, or by a locale on a client;
- grow by default. Only operations a query in this repository needed exist; an
  application adds its own question as an [operator](./operators.md).

When a list needs what the language lacks, its server gives it a hand-written
query source and the list has no body. The page then cannot place rows in it
and reads it again after a write, which is the behaviour of any list before
this language existed.

## Reference

| Call | Says | Null |
| --- | --- | --- |
| `Expr.eq(a, b)` | the same value | unknown if either is null |
| `Expr.isNull(a)`, `Expr.isNotNull(a)` | whether a value is absent | always answers |
| `Expr.lt`, `lte`, `gt`, `gte` | order; text under `binary` or `asciiFold`, against a field | unknown if either is null |
| `Expr.contains(text, search)` | `search` occurs in `text`, ASCII case folded | unknown if either is null |
| `Expr.in(a, list)` | `a` is one of `list` | unknown for a null `a`; an empty list matches nothing |
| `Expr.and`, `Expr.or`, `Expr.not` | SQL's three-valued connectives | `not` of unknown is unknown |
| `Expr.whenGiven(input, build)` | a filter that applies when its input is not null | |
| `Expr.input(key, schema)` | a value the run is given | |
| `Expr.viewer(Entity)`, `Expr.now` | who asks, and when, from the run's context | a visitor is null |
| a `one` relation as an operand | the id it points at | null where it points nowhere |
| `Expr.path(relation, end)` | a field, path or exists of the row reached | null where no row is reached |
| `Expr.exists(relation, where?)` | some row points here and holds `where` | never unknown in SQL |
| `Expr.is(Entity, tag, build?)` | the row is one case of a variant Entity (experimental) | false for another case |
| `Order.asc`, `Order.desc`, `Order.chosen` | an order term over the row's own fields | last ascending, first descending |
| `Query.dependencies(body)` | fields by role, inputs, operations, `reaches` | |
| `Query.placement(body, input)` | whether a client can order as the server does | |
| `Query.unsupported(body, operations)` | what a body needs that an interpreter lacks | |
| `evaluate(body, input, rows, { context })` | the reference answer over one table's rows | a missing key reads null |
| `Judge.query(body, input, heldRow, options)` | `Known` or `Unknown` over what a holder has | a missing key is not held |

The full API, with operators, variants, `step` forms and `Judge.pins`, is in
the [`foldkit-entity` README](../packages/entity/README.md#saying-something-about-a-row-expr).
For the domain an expression is written over, start at
[One domain declaration](./entity.md).
