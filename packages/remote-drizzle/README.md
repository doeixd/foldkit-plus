# `foldkit-remote-drizzle`

**Provisional.** A Drizzle compiler for [`foldkit-remote`](../remote) and
[`foldkit-remote-server`](../remote-server).

A Remote client already knows **which semantic fields it needs**. A
`RemoteServer` Source already knows **which ids and authorized fields to load**.
`foldkit-remote-drizzle` turns that Source request into the smallest useful
Drizzle query, then turns the rows back into normalized Remote patches.

```text
Remote Selection
      |
      v
Remote requirement
  Project:p1 [id,name]
      |
      v
RemoteServer Source context
  ids=[p1]
  fields=[id,name]
      |
      v
foldkit-remote-drizzle
  SELECT id,name
  FROM projects
  WHERE id IN (...)
      |
      v
normalized patch
  Project:p1 { id, name }
```

The important design choice is that an Entity is declared **once**:

```ts
const Project = entity('Project', projects)
```

That value is both the Drizzle binding and the Remote `EntityDescriptor`. A
Selection therefore checks fields against the real table declaration, while
`source(Project)` can compile those same semantic fields back into SQL without a
second mapping per screen.

Use this package when your Remote entities map cleanly onto Drizzle tables and
you want projection, relation loading, and keyset pagination derived from the
Remote contract. It is **not** an ORM on top of Drizzle and it does not own the
database connection. Sources require a `DrizzleDatabase` Effect service supplied
by the application.

## What it owns

```text
foldkit-remote
  semantic Entity / Selection / Query
             |
             v
foldkit-remote-server
  authorized Source request
             |
             v
foldkit-remote-drizzle
  columns / joins / pagination SQL
  row -> Remote normalization
             |
             v
Drizzle
  database execution
```

It does not own:

- client caching or rendering;
- Remote field authorization policy itself;
- authentication;
- mutation semantics;
- a database connection;
- arbitrary aggregate/query DSLs.

Those boundaries are deliberate. The adapter compiles Remote's existing
semantics instead of introducing a second data model.

## Install

```bash
pnpm add foldkit-remote-drizzle
```

`effect` is a peer dependency; `foldkit-remote`, `foldkit-remote-server`, and
`drizzle-orm` (currently pinned to `1.0.0-rc.4`) come with the package.

For the ownership and requirement-planning model first, read
[Server-derived state](../../docs/remote.md).

## Sixty seconds: one table, one Entity, one Source

Start with a normal Drizzle table:

```ts
import { pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const projects = pgTable('projects', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  status: text('status').notNull(),
})
```

Bind it once:

```ts
import { entity, source } from 'foldkit-remote-drizzle'

const Project = entity('Project', projects)

// This is a real Remote Selection because Project is also an EntityDescriptor.
const ProjectSummary = Project.select({
  id: true,
  name: true,
})

// This is a RemoteServer EntitySource backed by Drizzle.
const ProjectSource = source(Project)
```

A client requirement for:

```text
Project:p1 [id,name]
```

causes that Source to select only the needed columns, plus whatever identity is
required for normalization:

```text
SELECT id, name
FROM projects
WHERE id IN ('p1')
```

and return the Remote wire shape:

```ts
{
  id: 'p1',
  values: {
    id: 'p1',
    name: 'Apollo',
  },
}
```

There is no per-screen SQL mapping. The Selection declares the semantic shape;
`RemoteServer` hands the Source the authorized fields; the Drizzle Source turns
those fields into columns.

## Put the Source behind `RemoteServer`

```ts
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const Data = Remote.define({
  entities: [Project],
})

const Server = RemoteServer.make({
  entities: [ProjectSource],
})

RemoteServer.validate(Data, Server)

const handlers = RemoteServer.handlers(Server, principal)
```

`handlers` now requires the `DrizzleDatabase` service because the Source does.
Provide your application's database once:

```ts
import { Layer } from 'effect'
import { databaseLayer } from 'foldkit-remote-drizzle'

const DatabaseLive = databaseLayer(db)

// Useful in one process: tests, SSR, a worker, or a single service.
const RemoteClientLive = Remote.clientLayer(handlers).pipe(
  Layer.provide(DatabaseLive),
)
```

The adapter captures no connection. That keeps database ownership at the
application boundary and makes the Effect requirement visible in the server
composition.

## The binding is the shared schema

```ts
const User = entity('User', users)
```

`entity(name, table, { fields?, relations?, computed? })` derives an Effect
Schema from the Drizzle table with `drizzle-orm/effect-schema` and exposes the
table's columns as Remote fields.

The returned binding is simultaneously:

```text
Drizzle table binding
        +
Remote EntityDescriptor
        +
relation/computed metadata
```

That is why this works without a second Entity declaration:

```ts
const UserSummary = User.select({
  id: true,
  name: true,
})
```

A table must expose an `id` column. Every entity read selects the primary key for
normalization even when the client did not explicitly ask for `id`.

Use `fields` when the Remote schema should be narrower than the table or should
use an application-specific codec:

```ts
import { Schema } from 'effect'

const User = entity('User', users, {
  fields: {
    id: UserId,
    name: Schema.String,
  },
})
```

Relation/computed fields are derived on top of that map.

Definition-time checks reject ambiguous bindings such as a relation/computed
name colliding with a scalar field, a computed field naming an invalid
relation, or a nullable singular foreign key not marked `nullable`.

## Binding a `foldkit-entity` domain

`entity(name, table, …)` makes the table the declaration. When the domain is
declared with [`foldkit-entity`](../entity/README.md), the Entity already says
what each relation is, and `bind` says only how the database stores it:

```ts
import { Derived, Entity, Relation } from 'foldkit-entity'
import { bind, source } from 'foldkit-remote-drizzle'

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String })).pipe(
  Entity.derived({ fanCount: Derived.make(Schema.Number) }),
)
const Blog = Entity.relate(
  { User, Post },
  { Post: { author: Relation.one(User), fans: Relation.many(User) }, User: {} },
)

const Db = bind(Blog, {
  User: { table: users },
  Post: {
    table: posts,
    relations: { author: { field: posts.authorId }, fans: { foreignKey: users.id } },
    derived: { fanCount: { relation: 'fans' } },
  },
})

source(Db.Post) // an ordinary binding
```

| Entity member | Storage |
| --- | --- |
| Field | the column of the same name, or `fields: { name: posts.title }` |
| `one` relation | `{ field }`: the foreign key on the owner's table |
| `many` relation | `{ foreignKey, localKey? }` on the target's table (`localKey` defaults to the owner's `id`), or `{ through, localColumn, foreignColumn }` |
| Derived | `{ relation, where? }`: a count of a `many` relation |

`orderBy` and `where` go on a `many` storage as they do on `many(…)`.

A `one` may also be read from the other side, where the foreign key is a column
of the target's table, as a member's profile points at its member:

```ts
Member: { table: members, relations: { profile: { foreignKey: profiles.memberId } } },
```

It reads as the one ref, or `null` when no row points back, so the relation must
be `{ optional: true }`. One-to-one only holds if `profiles.memberId` is unique,
so `bind` refuses a column that is neither `.unique()` nor the primary key. A
unique index declared on the table is not visible on the column; vouch for it
with `assumeUnique: true`. Such a relation cannot be windowed or counted.

Target and cardinality are never repeated, so they cannot disagree with the
Entity. `bind` takes the whole `Entity.relate` result in one step, which lets
two bindings point at each other; `entity(…, { relations })` cannot, because a
relation there needs its target binding to exist first.

Each result is the same `EntityBinding` `entity` returns, and the same Remote
descriptor `Entity.from` gives the client, so register `Db.Post` (or
`Entity.from(Blog.Post)`) in `Remote.define` and pass `Db.Post` to `source`
and `query`.

The types and `bind` itself reject: a field with no column, a relation or
derived member with no storage, a `one` stored as a `many` or the reverse, a
count over a `one` relation, a required `one` over a nullable column
(declare the relation `{ optional: true }`), and a `one` read from the target's
table whose foreign key is not unique.

`bind` also refuses a column that plainly cannot hold its field: text under a
number field (a Postgres `numeric` reads as text), a number under a flag, and a
nullable column under a field whose schema admits neither `null` nor
`undefined`. It compares only what both sides state plainly. A schema that
transforms (`Schema.NumberFromString`), a mixed union, a struct, and a custom,
JSON or date column all pass unchecked, so the check never refuses a mapping
that could work.

## Which rows a principal may see

`authorize` decides which **fields** a principal may read. Which **rows** exist
for them is the binding's `visible`: a condition over the table's columns, or
`undefined` for every row.

```ts
const Db = bind(Blog, {
  Post: {
    table: posts,
    // A visitor sees what is published; an author sees every row.
    visible: principal => (isAuthor(principal) ? undefined : isNotNull(posts.publishedAt)),
  },
})
```

It is on the binding, not on a source, because a table is read four ways and a
rule on one would leave three open. Every one applies it:

| The table is read | What a hidden row is |
| --- | --- |
| by id | not returned, so the client knows it as `NotFound` |
| as the children of a relation | not listed, not counted by a derived count, and not a gap in a page |
| as the target of a `one` ref | the ref reads `null`, so it does not say the row exists |
| through a query | not in any page; a cursor on a hidden row does not resolve |

- A required `one` whose target can be hidden will read `null` for a principal
  who may not see it, which its schema refuses. Make such a relation
  `{ optional: true }`, or make the owner's `visible` depend on the target's.
- A relation's own `policies` still apply, beside the target's `visible`.
- `entity(name, table, { visible })` takes the same rule.

## Field authorization stays in `RemoteServer`

The adapter never decides what a principal may read. It compiles only the fields
`RemoteServer` has already allowed:

```ts
const UserSource = source(User, {
  authorize: (principal, fields) =>
    fields.filter(field => field !== 'email' || principal.canReadEmail),
})
```

Conceptually:

```text
client asks for [id,name,email]
          |
          v
RemoteServer authorize
          |
          v
allowed [id,name]
          |
          v
Drizzle source
SELECT id,name ...
```

A request for a field the Entity does not declare never reaches the read. The
Source still always selects the id needed to normalize rows.

`reader(binding, run)` is the lower-level injected-executor form when the
database is not provided as the `DrizzleDatabase` service or when you want to
test the projection compiler directly. It handles scalar and singular-ref
normalization, but collection loading/computed fields belong to `source`.

## Singular relations

Declare a foreign key once with `one`:

```ts
import { entity, one } from 'foldkit-remote-drizzle'

const User = entity('User', users)

const Project = entity('Project', projects, {
  relations: {
    owner: one(User, { field: projects.ownerId }),
  },
})
```

Now `owner` is a Remote ref field:

```ts
const ProjectSummary = Project.select({
  id: true,
  name: true,
  owner: true,
})
```

The Source selects `owner_id` but emits the Remote ref key:

```text
row:         owner_id = u1
wire value:  owner = "User:u1"
client:      { entity: 'User', id: 'u1' }
```

If the foreign key is nullable, declare that explicitly:

```ts
owner: one(User, {
  field: projects.ownerId,
  nullable: true,
})
```

A database `NULL` then becomes a **present null** in Remote rather than looking
like an absent field that should be fetched forever.

A nested Selection does not embed the User row into Project. `RemoteServer`
follows the ref into the User Source at the next selection level, preserving the
normalized cache:

```text
Project:p1.owner -> User:u1
                      |
                      v
                 User Source
```

## Collection relations

A `many` relation says that the foreign key lives on the target:

```ts
import { entity, many } from 'foldkit-remote-drizzle'

const Comment = entity('Comment', comments)

const Post = entity('Post', posts, {
  relations: {
    comments: many(Comment, {
      foreignKey: comments.postId,
      localKey: posts.id,
    }),
  },
})
```

A normal collection read batches children across all requested parents instead
of issuing one query per parent. The wire value remains normalized refs:

```text
Post:p1.comments = ["Comment:c1", "Comment:c2"]
```

Collection relations may also declare:

- `orderBy` — defaults to target id;
- `where` — a static filter, such as excluding soft-deleted rows.

### Many-to-many

Use a through table when the relation is many-to-many:

```ts
import { entity, manyToMany } from 'foldkit-remote-drizzle'

const Tag = entity('Tag', tags)

const Post = entity('Post', posts, {
  relations: {
    tags: manyToMany(Tag, {
      through: postTags,
      localColumn: postTags.postId,
      foreignColumn: postTags.tagId,
    }),
  },
})
```

The Source joins through the link table to the target, drops dangling through
rows, and emits target refs.

### Principal-scoped collection policy

A collection can add a per-principal SQL predicate:

```ts
import { eq } from 'drizzle-orm'

const PostSource = source(Post, {
  policies: {
    comments: principal => eq(comments.visibleTo, principal.id),
  },
})
```

That predicate is combined with the relation's static `where`. Policies are only
valid for collection relations; putting one on a singular relation is rejected
at definition time because it would not filter the target read correctly.

## Windowed collection relations

A Selection can ask for a bounded connection instead of the full collection:

```ts
import { Selection } from 'foldkit-remote'

const PostView = Selection.make(Post, {
  id: true,
  comments: Selection.connection(Comment, {
    first: 10,
  }),
})
```

For several parent posts, the Source ranks children **per parent** in one SQL
statement (`row_number() over (partition by ...)`) and keeps the requested page
plus the extra row needed to determine the boundary. The statement count does
not grow with the number of parents.

The result carries:

```ts
{
  refs,
  hasNext,
  hasPrevious,
}
```

`first` and `last` work per parent. `after` / `before` cursor pagination is only
accepted when the read targets one parent because a single cursor is ambiguous
across several parents.

When the client asks for another cursor page, Remote's reducer merges it onto
the stored relation page: `after` appends and `before` prepends.

## Query connections

Top-level Remote Queries compile to keyset pagination:

```ts
import { eq } from 'drizzle-orm'
import { Schema } from 'effect'
import { Query } from 'foldkit-remote'
import { query } from 'foldkit-remote-drizzle'

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: Schema.Struct({ ownerId: Schema.String }),
  Result: Query.connection(Project),
})

const ProjectsByOwnerSource = query(ProjectsByOwner, {
  entity: Project,
  orderBy: [
    { column: projects.createdAt, direction: 'desc' },
    { column: projects.id, direction: 'desc' },
  ],
  where: input => eq(projects.ownerId, input.ownerId),
})
```

Think of the pieces as:

```text
Remote Query descriptor
  input + result entity
          |
          v
Drizzle query source
  where + stable total order
          |
          v
QueryPage
  edges + explicit boundaries
```

`orderBy` must be non-empty and should form a stable total order. Add a unique
tie-breaker such as the id.

### Sorting by what the user chose

`orderBy` may read the query's input, as `where` does:

```ts
query(PostsQuery, {
  entity: Db.Post,
  where: ({ search }) => (search === '' ? undefined : like(posts.title, `%${search}%`)),
  orderBy: ({ sort }) =>
    sort === 'title'
      ? [{ column: posts.title, direction: 'asc' }]
      : [{ column: posts.id, direction: 'asc' }],
})
```

- `sortTerms(sort, { title: posts.title, created: posts.createdAt })` turns the
  state `foldkit-crud`'s `Sort` makes (`{ by, direction }`, or `null`) into order
  terms: `orderBy: ({ sort }) => sortTerms(sort, { ... })`. A name the map lacks,
  or no sort, is no terms, which orders by id.
- The input should name an order (`'title'`), never a column: which columns may
  sort is the server's to decide.
- The input is part of a connection's identity, so each order is its own
  connection with its own cursors. A cursor from one order never pages another.
- A computed order that leaves the id out is tie-broken by it, ascending, since
  what a user sorts by is rarely unique. An empty computed order is the id's.
- Keyset paging over a nullable column follows Postgres `NULL` ordering; on
  another dialect, sort by columns that are not null.

The wire cursor remains the row id. To continue a page, the Source re-reads that
row's ordering tuple and builds the keyset predicate from the real ordered
column values.

Client-supplied windows are bounded: the default page size is `20`, the default
maximum is `100`, and malformed combinations such as `after + before` or
`first + last` fail rather than being guessed. A cursor that no longer resolves
also fails rather than silently restarting at page one.

## Computed fields

The built-in computed field is a count over a collection relation:

```ts
const Post = entity('Post', posts, {
  relations: {
    comments: many(Comment, {
      foreignKey: comments.postId,
      localKey: posts.id,
    }),
  },
  computed: {
    commentCount: { relation: 'comments' },
  },
})
```

`commentCount` becomes a Remote number field. The Source runs a grouped
`count(*)`, including the relation's static `where` and principal policy. The
count is the total relation count, not the current page count.

Other aggregate shapes are intentionally not a generic compiler yet.

## Mutations use Drizzle directly

This package does **not** add a mutation DSL. Mutation semantics belong to the
application and `RemoteServer.mutation`.

The adapter only helps normalize rows you already chose to return:

```ts
import { eq } from 'drizzle-orm'
import { Effect } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
import { returning } from 'foldkit-remote-drizzle'

const project = returning(Project, [
  'id',
  'name',
  'owner',
])

const RenameProjectSource = RemoteServer.mutation(
  RenameProject,
  ({ input }) =>
    Effect.gen(function* () {
      const rows = yield* Effect.promise(() =>
        db
          .update(projects)
          .set({ name: input.name })
          .where(eq(projects.id, input.id))
          .returning(project.columns),
      )

      return {
        output: { id: input.id },
        entities: project.patches(rows),
      }
    }),
)
```

`returning(binding, fields)` pairs the Drizzle column projection with the
normalizer for those exact fields, so the mutation cannot accidentally select
one shape and normalize another. Singular relation foreign keys are rewritten
to Remote ref keys.

`selectColumns` and `normalize` are the lower-level halves when you need them
separately.

## Compose the server

```ts
const Data = Remote.define({
  entities: [User, Project],
  queries: [ProjectsByOwner],
  mutations: [RenameProject],
})

const Server = RemoteServer.make({
  entities: [source(User), source(Project)],
  queries: [ProjectsByOwnerSource],
  mutations: [RenameProjectSource],
})

RemoteServer.validate(Data, Server)

const handlers = RemoteServer.handlers(Server, principal)
```

Every Drizzle Source contributes `DrizzleDatabase` to the Effect environment.
If a server combines Sources requiring different services, make that union
explicit in the `RemoteServer.make` environment rather than hiding a dependency.

## Database service

```ts
import { databaseLayer } from 'foldkit-remote-drizzle'

const DatabaseLive = databaseLayer(db)
```

`db` can be any Drizzle database with the select-builder surface this compiler
uses. `databaseLayer` contains the structural adaptation once, so Sources simply
yield `DrizzleDatabase`.

The package deliberately does not import `drizzle-orm/effect-postgres` while its
Effect RC compatibility differs from this workspace. Provide the database tag
through `databaseLayer` instead.

## Testing a binding

The package test suite runs the adapter against a real in-process SQLite
database via Node's `node:sqlite` and `drizzle-orm/node-sqlite`. That is a good
pattern for application binding tests: build a tiny schema, seed rows, provide
the database Layer, and assert the actual normalized wire values.

```ts
const records = await Effect.runPromise(
  source(Project)
    .read({
      ids: ['p1'],
      fields: ProjectSummary.fields,
      principal: null,
    })
    .pipe(Effect.provide(DatabaseLive)),
)
```

For relation-heavy examples, see
[`example/nested.ts`](./example/nested.ts), which exercises declarations,
normalization, a windowed relation page, and a keyset Query against seeded
SQLite.

```bash
pnpm exec tsx packages/remote-drizzle/example/nested.ts
```

## Dialect and limits

The binding accepts Drizzle's base `Table`, but the pagination semantics are
currently designed around Postgres behavior:

- keyset pagination follows Postgres NULL ordering (ASC nulls last, DESC nulls
  first);
- windowed nested pagination needs window functions and row-value `IN`
  (Postgres, SQLite 3.25+, MySQL 8+);
- computed fields are counts only;
- there is no mutation DSL;
- `reader`, the injected-executor path, does not load collections or computed
  fields;
- nested targets remain normalized refs and are resolved by
  `foldkit-remote-server`, never embedded objects.

The SQLite integration tests are a real SQL/compiler check, but they do not
prove every Postgres-specific NULL-ordering edge case.

## License

MIT. The keyset-cursor and projection logic adapts
[fate](https://github.com/nkzw-tech/fate)'s Drizzle integration (MIT, Copyright
(c) 2025 Nakazawa Tech); see [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).

## See also

- [Server-derived state](../../docs/remote.md) — why Remote requirements exist
  and who owns server-derived state.
- [`foldkit-remote`](../remote) — client requirements, normalized Model,
  subscriptions, mutations, and live data.
- [`foldkit-remote-server`](../remote-server) — Source authorization,
  normalization, handlers, and live infrastructure.
- [`examples/kitchen-sink`](../../examples/kitchen-sink) — Remote + Drizzle +
  RemoteServer in one executable trace.
