# foldkit-cms-drizzle

Storing drafts inside your published database table forces every query in your
app to remember `WHERE published_at IS NOT NULL`. Miss that filter once on a
relation, reference lookup, or search endpoint, and visitors see unfinished
drafts or unpublished rows.

`foldkit-cms-drizzle` stores entries, working drafts, and revision history in
three separate Drizzle tables (`cms_entries`, `cms_drafts`, `cms_revisions`)
beside your content tables, and enforces visitor visibility on every table
binding through [`foldkit-guard`](../guard/README.md). Authors read drafts and
unpublished rows; visitors see only rows permitted by your content Entity's read
rules, whether fetched by id, relation, reference, or query. It supports SQLite
and Postgres (both provide `RETURNING` for atomic conflict checks).

See the server and editor running together in the
[live CMS demo](https://foldkit-cms-demo.pages.dev/).

## Install

```sh
pnpm add effect drizzle-orm foldkit-cms foldkit-cms-drizzle foldkit-guard foldkit-remote-drizzle foldkit-remote-server
```

## A first guarded blog server

Given your `User` principal schema, `Blog.Post` entity, `Posts` content type
from [`foldkit-cms`](../cms/README.md), Drizzle `posts` table, `bind` helper,
and `createPost`/`updatePost` handlers (shown whole in
[the runnable server](../../examples/cms/src/server/server.ts) and compiled in
[`test/readme.test-d.ts`](test/readme.test-d.ts)), this creates the CMS tables,
attaches visitor visibility, and builds the server handlers:

<!-- docs-check
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option as EffectOption, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { type DrizzleDatabase, bind } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['author', 'editor', 'reader']) })
type Principal = EffectOption.Option<typeof User.Type>
const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  publishedAt: text('published_at'),
})
const Blog = {
  Post: Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, title: Schema.String, publishedAt: Schema.NullOr(Schema.String) }),
  ).pipe(Cms.roles({ label: 'title', published: 'publishedAt' })),
}
const PostInput = Schema.Struct({ title: Schema.String })
const Posts = Cms.content('posts', {
  entity: Blog.Post,
  form: Form.make('PostForm', Entity.input(Blog.Post, PostInput)),
  publish: {
    create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: Schema.String } }),
    update: Mutation.make('UpdatePost', { Input: { ...PostInput.fields, id: Schema.String }, Output: {} }),
  },
  words: { one: 'Post', many: 'Posts' },
})
const createPost = RemoteServer.mutation<Principal, DrizzleDatabase>(Posts.publish.create, () =>
  Effect.succeed({ output: { id: 'p1' } }),
)
const updatePost = RemoteServer.mutation<Principal, DrizzleDatabase>(Posts.publish.update, () =>
  Effect.succeed({ output: {} }),
)
-->

```ts
import { Option } from 'effect'
import { CmsServer, Transaction, sqliteTables } from 'foldkit-cms-drizzle'
import { Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { GuardDrizzle } from 'foldkit-guard/drizzle'

const G = Guards.declare('Cms', User, guard => ({
  isAuthor: guard.principal(),
  isPublished: guard.row(Blog.Post, () => Expr.isNotNull(Blog.Post.fields.publishedAt)),
}), { key: user => user.id, unguarded: 'allow' })

const Policy = G.implement({
  isAuthor: principal => Option.exists(principal, user => user.role !== 'reader'),
})
const Post = Blog.Post.pipe(Guards.attach(G, { row: { Read: [G.isPublished, G.isAuthor] } }))
const Db = bind({ ...Blog, Post }, {
  Post: { table: posts, visible: GuardDrizzle.visible(Policy, [Post]).Post },
})

const cms = CmsServer.make({
  tables: sqliteTables(), // or pgTables(); include in your migrations
  content: [{ type: Posts, entity: Post, binding: Db.Post, create: createPost, update: updatePost }],
  transaction: Transaction.statements, // one connection; use Transaction.drizzle for Postgres
  policy: Policy,
  authors: [G.isAuthor],
})
```

`cms` gives you `cms.sources`, `cms.queries`, and `cms.mutations` to spread into
`RemoteServer.make`, plus `cms.due` for scheduled releases and `cms.import` for
seeding existing content. Visitors reading `Post` through any query or relation
see only rows where `publishedAt` is non-null, while authors see all rows and
working drafts.

## Where published rows and drafts live

| Fact | Owner |
| --- | --- |
| Published content | your tables, bound with `bind` as usual |
| Unpublished work | `cms_entries`, `cms_drafts`, `cms_revisions` |
| Access to CMS tables | this package: refused unless the caller is an author |
| Visitor visibility on content rows | your content Entity's Read rules in `visible` |
| Who is an author and may transition | your guard set (`authors`, `transitions`); `allow` per entry |
| What publishing a post *does* | your own `create` and `update` handlers |
| Atomic publish commits | this package, inside the `transaction` you supply |
| The current clock | your `now` option, defaulting to the server clock |

## How visitor visibility reaches every query

A table can be read four ways: by id, as children of a relation, as the target
of a reference, and through a query. Guarding only one endpoint leaves the other
three open. Instead, the audience boundary is attached as a
[`visible`](../remote-drizzle/README.md#which-rows-a-principal-may-see) rule on
the Drizzle table binding itself, so every read path applies it automatically.

An author's principal sees entries, drafts, revisions, and every content row. A
visitor's principal sees only published content rows. Pass `transitions` to
`CmsServer.make` (for example, `{ publish: [isEditor], schedule: [isEditor],
unpublish: [isEditor] }`) to restrict who may publish or unpublish.

## Server setup notes

- **Register `cms.sources`, not `source(Db.Post)`.** They are the content types'
  sources and the CMS's own, each behind the boundary.
- **A content type that can be unpublished must be guarded by whether it is.**
  `CmsServer.make` throws for a type with a `published` role whose Read rule
  does not read that field, and, through `GuardServer.validate`, for a binding
  whose `visible` is not the rule your guard set built for it. `entity` is the
  type's Entity with its guards attached, the one its table was bound from.
- A content type with no `published` role has nothing to hide, and needs none.
- **Who is an author** is any of `authors`, principal guards; anyone else is a
  visitor. Their bodies are asked with the interaction it is for, `Read` for
  reading unpublished work and `Update` for any operation on it, so a reviewer
  can read what they may not change. **Who may make a transition** is an author any of its
  `transitions` guards lets; a transition not named is any author's. Archiving
  an entry on show takes it off, so it asks `unpublish`'s guards too. `allow`
  stays for a rule about the entry itself. A refusal is `Forbidden`, with its
  sentence.
- **A write says of an entry only what its caller may read.** An author your
  guards let `Update` and not `Read` (a drop box, a publishing job) changes
  unpublished work and reads none of it. Such a caller's write that is made
  answers its `output` and no patch of the entry, its draft or its revisions,
  which the server cuts to what the caller may read (a row on show, such as
  the article a publish put there, is still answered). One that is refused answers what an entry that is
  not there answers (`There is no such entry`; for a save that names a
  `basedOn`, the `Cms.refusal.conflict` of a discarded draft), whatever
  refused it: the entry's type, its state, its revisions, a taken address,
  `transitions`, `allow`, or your handler's own refusal. What was sent is
  still refused in its own words (an unknown type, a draft too large, a time
  that is not one), before any entry is looked up, and a failure on the
  server's side still reads `Internal error` with an incident. Such a caller
  can still tell two things. A write that was made was made. And a first save
  (`basedOn: null`) of an id an entry already has reads `This draft cannot be
  saved as this entry`, whatever the entry is, since an id cannot be given
  twice; ids are random (`Cms.newEntryId()`), so that lists nothing. A live
  hub is told of no row by such a caller's write.
- **`create` and `update` go to the CMS, not to `RemoteServer.make`.** Registered
  there too, they are a way to publish with no draft, no revision and no `allow`.
- **Content that exists already is imported, not inserted.** `cms.import({ type,
  values, as, at, entry })` makes the entry and a draft of `values`, then publishes
  it as a publish does: your `create` handler writes the row, as `as`, and revision
  1 records `values`, dated `at`. It is one transaction, and the server's own act,
  so `allow` is not asked. Writing the CMS's tables by hand has to match what a
  publish writes, and drifts.

### Seeding

A seed is a runner over `cms.import` — one item per entry, in dependency order:

- **Fix the clock.** Pass `now` to `CmsServer.make` and `at` to each import,
  so every run writes the same dates: the build's pages and every sandbox agree.
- **Name entries that are pointed at.** Pass `entry` where another import names
  it (a page naming its featured post), and import what is pointed at first so
  the id is known. Anything else takes the default new id.
- **Fix `as` once.** Import as an editor and vary the rest; the input is
  `ImportItem<P>` less `as`, so the runner and the tool cannot drift.

The CMS example's `seed.ts` is the worked shape: dated posts, then the pages
that point at them.

## Verify the audience boundary

Before connecting the editor, exercise the same content read as an author and
as a visitor. An author may see working content; a visitor must see only rows
allowed by the binding's `visible` rule. Repeat through a relation and a query,
not just a direct id read. CMS state and allowed actions are separate from the
identity established by your HTTP or RPC authentication.

For the first write, save a draft and read the public row again: it must be
unchanged. Publishing should then update the row, append a revision, and remove
the draft within the supplied transaction. A scheduled time alone executes
nothing; your host must call `cms.due` as described below.

## Saving a draft

`CmsSaveDraft` writes the working copy, valid or not. The client names something
new (`Cms.newEntryId()`), and the first save of an id nobody has makes the entry.

- **A save names what it was made from** (`basedOn`, the draft's `updatedAt`). A
  newer one on the server means someone else saved in between, and the save is
  refused with `Cms.refusal.conflict` instead of undoing their work. It is one
  statement, compare and set, so two saves cannot both win.
- A draft is bounded: `maxDraftSize` characters of JSON, values and Model
  together, one million by default. More is refused, and nothing is written.
- Two saves in the same instant still get different `updatedAt`s, so the next
  save can tell them apart.
- It answers with the entry and the draft as patches, so the client holds both
  with no refetch. Every operation patches the entry with its `state` and its
  `revision`, so what is on screen follows what was done.
- Refused: a type the server does not know, an entry that is not there or is of
  another type, an archived entry, and, as `Forbidden`, a principal that is not
  an author and an author your `transitions` or `allow` refuse.

`CmsDiscardDraft` removes the working copy. A published entry is left as it was
published. An entry that was never published has nothing left, so it is removed
too, and the client is told both are gone.

## Publishing

`CmsPublish` runs your handler with the draft's value: `create` when the entry
has no row, `update`, with the row's id added, when it has. Around it, in one
transaction: the `published` column is set if it was empty, the revision is
appended, the draft is removed, and the entry is told its row. A handler that
fails after writing leaves nothing behind.

- **Every operation is one transaction**, not only a publish: a save that made an
  entry and could not make its draft leaves neither.
- **You name the transaction**, because Drizzle's differ by driver.
  `Transaction.statements` is `begin` and `commit` as statements, for a database
  that is one connection (a SQLite file). `Transaction.drizzle` is
  `database.transaction`, for a driver whose transactions are asynchronous
  (Postgres, libSQL); your handlers then get the transaction as their
  `DrizzleDatabase`. Statements over a pool would not roll back.
- **One connection holds one transaction**, so under `Transaction.statements` this
  package's operations take turns at the database. Without that, a save arriving
  while a publish is failing would be rolled back with it, after it was reported
  done. A write of your own on the same connection does not take a turn unless
  you make it inside `Transaction.statements` too.
- **A publish names the revision it was made from** (`basedOn`, the entry's
  `revision`, or `null`). A newer one is refused with `Cms.refusal.conflict`, not a publish over
  someone else's. The entry's `revision` is compared and set first, inside the
  transaction, so of two publishes made from one revision one writes nothing.
- A draft your mutation's Input refuses is not published, and the error names
  the fields it would not take (`This draft is not ready to publish: check
  title`), not the Schema's own message, which quotes values. The draft is kept.
- **A failure on the server's side tells the author nothing of it.** A handler
  of yours that fails with a `RemoteServerError`, a statement the database
  refuses and a defect all read `Internal error` with an incident, and the
  cause is in the server's `ServerDefect` report under that id (see
  [When the server fails](../remote-server/README.md#when-the-server-fails)).
  Fail your handler with `RemoteServer.tell('…')` for words the author should
  read. The CMS's own refusals (`There is no such entry`, `This entry cannot be
  published as it stands`, `An archived entry takes no draft`) are told that
  way, and only to an author who may read unpublished work.
- A row that is already shown keeps the date it was first published on.
- The row as your handler left it goes to the client with the entry and the
  revision, every column of it, so a handler need not patch what it wrote. What
  your handler returns (patches, connection changes, deletions) goes too.

### Slugs

A content type with a `slug` role is found by it: `cms.queries` has
`Cms.bySlug(Posts)`, behind the same `visible` rule as every other read, so a
visitor does not find what is not published.

A publish to a slug another row has is refused with
`Cms.refusal.field('slug', 'That address is taken: "hello" is already used')`,
which names the form key to show it on; a client reads it with `Data.refusal`. **The check is advice; a unique index is the
rule.** Two publishes can both pass the check, and the one the index refuses
gets the same error. Without a unique index on the column, that race publishes
two rows at one address. The slug is read from the publish input's member of the
same key as the Entity's.

### Unpublishing

`CmsUnpublish` empties the `published` column. The row and its revisions are
kept; a visitor stops seeing it, by every path, and publishing shows it again.
Only a type with a `published` role offers it.

## Scheduling

`CmsSchedule` promises a draft for later: it sets the draft's `scheduledFor`,
after checking the publish mutation would take the draft now. What could not be
published now is not promised for later. `CmsUnschedule` takes the promise back.

Nothing else happens until you call `due`:

<!-- docs-check standalone
import type { Effect } from 'effect'
interface Principal {
  readonly name: string
}
declare const cms: {
  readonly due: (
    at: Date,
    options: { readonly as: (scheduledBy: string | null) => Principal },
  ) => Effect.Effect<unknown>
}
declare const authors: { readonly byName: (name: string | null) => Principal }
declare const run: <A>(effect: Effect.Effect<A>) => Promise<A>
-->

```ts
// A Cloudflare cron trigger, a setInterval, a queue consumer: the host's choice.
export default {
  scheduled: () =>
    run(cms.due(new Date(), { as: name => authors.byName(name) })),
}
```

- **Triggered by your host.** Call `cms.due` from a Cloudflare cron trigger,
  queue consumer, or interval so clustered hosts never fire duplicate jobs.
- `due(now, { as })` publishes every draft whose time has come, each in its own
  transaction, **as whoever scheduled it**: a draft keeps the name your `nameOf`
  gave, and `as` says who that is now. Someone who has since lost the right
  publishes nothing.
- **A publish that fails stays scheduled, with the reason.** The entry reads
  overdue with that error, and stays paused until the draft changes so a fault
  is not hammered every minute. The entry keeps a reader-facing reason as it is
  (a denial, a declared refusal, `RemoteServer.tell`); any driver or handler
  failure reads `Internal error, incident <id>` on the entry and reports its
  cause as a `ServerDefect` (`during: 'publish due <entry>'`) through the
  `Diagnostics.Reporter` `due` runs with.
- **What was promised is changed only by someone who could have promised it.**
  Since a scheduled draft is published as whoever scheduled it, saving over it,
  restoring over it or discarding it is refused to an author your `transitions`
  or `allow` would not let `schedule`. Otherwise someone who may not publish would publish through
  someone who may.
- One failure leaves the remaining entries running. `due` answers with each
  entry and its error (or `null`) in the failure's own words for host logging.
- An archived entry keeps its promise waiting until restored.

## Restoring

`CmsRestore` copies a past revision's value into a working draft to review,
edit, and publish as the next revision. It replaces any current draft, clears
any pending schedule, and keeps the form values key by key so older revisions
still open cleanly.

## Archiving

`CmsArchive` puts an entry away: off the worklist, and, for a type with a
`published` role, off show. `CmsUnarchive` brings it back as unpublished work;
publishing shows it again.

## The worklist, and an entry's state

`cms.queries` includes `Cms.Entries`: the entries of one content type, searched
by label (literal characters: `%` and `_` are matched directly, not as
wildcards), filtered by archived status. It lists entries rather than published
rows, so unpublished drafts appear in the worklist.

An entry's `state` is derived on the server with `Cms.state` from whether the
entry has a draft, whether a visitor can see its row, and your `now` clock. An
overdue scheduled publish reads overdue with its reason.

## Main exports

| Call | Meaning |
| --- | --- |
| `sqliteTables()`, `pgTables()` | Three CMS Drizzle tables per dialect (`sqliteSchema` for SQL DDL). |
| `Transaction.statements`, `Transaction.drizzle` | Transaction wrapper for SQLite single connections or async drivers. |
| `CmsServer.make(options)` | Builds `sources`, `queries`, `mutations`, `due`, `import`, and `bindings`. |
| `cms.due(now, { as })` | Publishes due drafts; returns an Effect of `{ entry, error }` per item. |
| `cms.import({ type, values, as, at?, entry? })` | Seeds published content through the publish path in one transaction. |

`CmsServer.make` takes `{ tables, content, transaction, policy, authors,
transitions?, allow?, now?, nameOf?, maxDraftSize? }`, where each `content`
entry is `{ type, entity, binding, create, update }`.

## Limits

- `transitions` and `allow` are asked about every transition, and again when an
  entry is read with `may`: the entry's `may` is the transitions they let the
  reader ask (`Cms.transitions` filtered; each transition's guards decided once
  per read), so the client can leave out what would be refused. Whether the
  entry offers one now is its `state`'s to say. This `may` is the CMS's own,
  not `foldkit-guard`'s.
- `CmsPublish` needs a draft. To show an unpublished row again as it is, the
  editor's publish saves what is there first; a client of your own does the same.
- A driver's refusal is recognised by its words (`unique` or `duplicate`, and the
  column's name). SQLite and Postgres say both; a constraint named without the
  column fails the publish as `Internal error`, the driver's own error in the
  server's `ServerDefect` report.
- Conflicts are refused, not merged.
- A client that holds an entry's `revisions` list refetches it after a publish;
  the new revision arrives as a patch, not as a place in that list.

## Next

- Define content roles, forms, and the client editor:
  [`foldkit-cms`](../cms/README.md).
- Configure row and principal guards for Drizzle bindings:
  [`foldkit-guard`](../guard/README.md).
- Run the complete SQLite server and browser editor:
  [the CMS example](../../examples/cms/README.md).
