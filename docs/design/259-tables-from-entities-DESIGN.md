# Tables and CHECKs from the Entities (#259)

Status: built (2026-10-27): `entityChecks` and `checkConstraints` in
`foldkit-remote-drizzle`, `bind` refusing a table whose own CHECKs disagree,
and Chirp's tables holding its domain's rules with no rule written in SQL.
Deriving whole tables, foreign keys and `onDelete` are not built; see
[Not done](#not-done).

## The problem

An application on `remote-drizzle` states its schema three times: the Entity
(fields, Schemas, invariants), the Drizzle table, and the migration. Nothing
holds the copies together, and the copy that drifts is the rules. Chirp's
migration said `check (length(body) <= 280)` beside a domain that said
`isMaxLength(280)`; raise one to 500 and the client and server accept 500 while
the database refuses at 281. That surfaces as a constraint error on a write, not
at compile time or at startup.

The issue offered two directions: derive the tables and CHECKs from the
Entities, or check hand-written ones against them.

## Who owns what

The decision follows from asking who owns each fact in a table.

| Fact | Owner | Why |
| --- | --- | --- |
| Which values a field admits (lengths, a pattern, a range, literals) | the Entity | the domain's rule; the client, the server and a form all read it |
| Which rows are valid together (a state invariant) | the Entity | the same, over a whole row |
| What a column is called, its SQL type (`integer` or `real` for a number, `text` or `uuid`), defaults, keys, indexes, collation | the database | storage and access paths; two databases may store one Entity differently |
| Join tables with no Entity (Chirp's `likes`), auth tables | the database | the domain has no declaration of them at all |

So the two directions apply to different facts:

- **Rules are derived.** A CHECK is the domain's rule written again in SQL.
  Writing it by hand is the second statement this project rules out. The Entity
  is its one owner, and the CHECK is compiled from it.
- **Storage is checked.** A column is the database's own fact. Deriving it would
  need a second language for what Drizzle's column builders already say (which
  integer, which text type, which name), typed per dialect, so a derived
  `posts.authorId` stays usable in `eq(...)`. It would not remove a statement,
  only move it. `bind` already holds each column to the Entity: a kind the field
  cannot hold, or a nullable column under a field that admits no null, is
  refused. That check stays as it is, now reading nullability from the stored
  side (an `Option` field stores its none as a null).

Drizzle stays a peer. Nothing here makes or re-exports a column builder.
`drizzle-kit` still writes the migration from the Drizzle table, as it already
does for Chirp's auth tables.

## API

```ts
// The drizzle-kit route: the table holds the Entity's CHECKs.
const posts = sqliteTable('posts', { … }, t => entityChecks(Post, t))

// The hand-written SQL route: the same CHECKs as clauses.
const { constraints, serverOnly } = checkConstraints(Db.Post)
sqlite.exec(`create table posts (…, ${constraints.map(c => c.constraint).join(', ')})`)
```

- `entityChecks(entity, columns, { fields?, operators? })` returns Drizzle
  `check()`s for the table's third argument. It takes the Entity, not the
  binding. Drizzle calls that callback lazily (`getTableConfig`, `drizzle-kit`),
  and the binding is made from the table, so a callback that read the binding
  would read it before it exists. `fields` names a column stored under another
  key, as `bind`'s `fields` does.
- `checkConstraints(binding)` returns each CHECK as `constraint "<name>" check
  (…)`, and `serverOnly`: each rule no CHECK holds, as a sentence naming the
  field. It replaces `invariantChecks`, which gave the invariant CHECKs alone.
  Keeping both would be two ways to ask for the same constraints.
- Names: `<table>_<column>_check` for a column's rules, `<table>_<id>` for a
  state invariant (as before).
- `bind` compares a table's own Drizzle CHECKs with what it would derive (see
  [Failure semantics](#failure-semantics)).

## What compiles: exact or not at all

A CHECK and a Schema that disagree fail in two ways. If the CHECK is stricter,
a write the server accepted fails in the database. That is the drift the issue
reports. If the CHECK is looser, raw SQL writes a row the domain calls invalid.
So a rule compiles only where the database's answer is the Schema's for every
value of the field's kind. The law, tested on SQLite and Postgres
(`test/checks.test.ts`), is:

> For each field and each value of its kind, the database accepts the value
> exactly when the field's Schema does.

| Rule | SQL | Exact because |
| --- | --- | --- |
| `isMinCodePoints`, `isMaxCodePoints`, `isBetweenCodePoints` | `length(c) >= n`, `<= n` | SQLite's and Postgres' `length` count code points, as these do |
| `isMinLength(0 or 1)`, `isNonEmpty` | `length(c) >= 1` | at least one UTF-16 unit is at least one code point |
| `isMinLength`, `isMaxLength`, `isBetweenLength`, beside an ASCII pattern | `length(c) …` | every string the pattern accepts is ASCII, where units and code points agree |
| `isPattern(/^[set]q$/)`: one bracket of ASCII letters, digits, `_`, `.`, space, `-`, `\d`, `\w`; `q` is `+`, `*`, `{m}`, `{m,}` or `{m,n}`; flags none or `u` | SQLite `c not glob '*[^set]*'`, Postgres `c !~ '[^set]'`, and the lengths | both read the bracket by code point, and the set is spelled out (Postgres' `\w` is wider than JavaScript's) |
| `isGreaterThan`, `isGreaterThanOrEqualTo`, `isLessThan`, `isLessThanOrEqualTo`, `isBetween` | `c > x`, … | finite bounds, compared as numbers |
| `Schema.Literals` of strings or of numbers | `c collate binary in (…)` (Postgres: `collate "C"`) | compared byte for byte, whatever the column's own collation |

Everything else is `serverOnly`: a unit length with no ASCII pattern (with a
hint to say it in code points), a pattern outside that grammar or with the `i`
flag, `isTrimmed`, a custom filter, a rule made after a transformation (the
column stores the encoded side; a `NumberFromString`'s `isGreaterThan(0)` judges
the number, not the stored text), and a transition invariant, which reads the
row before the write. Such a rule is listed, not refused: the server still
holds it on every declared write. A binding reports them as one
`ServerOnlyRules` diagnostic (#237) on its first write through `writer`: `bind`
is synchronous, and that write is the first Effect where the server's reporter
applies.

A field's rules join into one CHECK. A null passes it (SQL calls the condition
unknown), which is right: a column can be null only under a field that admits
null, and `bind` refuses any other. An invariant keeps its `(…) is true`, since
an invariant calls a null comparison false.

Known gaps, narrow enough to state:

- **NaN.** `Schema.Number` admits it and every comparison refuses it. Postgres
  orders NaN above every number, so `c > 0` accepts it. That is looser, never
  stricter. SQLite cannot store NaN.
- **NUL in text.** SQLite's `length` stops at the first NUL, so a length CHECK
  miscounts such text. Postgres refuses NUL in text altogether. The law's
  values hold no NUL.

## Failure semantics

- **A table that holds the Entity's CHECKs** (`entityChecks`) binds.
- **A table with a check that says another rule** under a derived name, a
  column check whose rules are gone (`<table>_<column>_check` with nothing
  derived there), or one derived check missing beside others is refused by
  `bind`, which names the check, both conditions, and the fix.
- **A table holding none of the derived names** is not checked. Its database
  may hold the rules through SQL (`checkConstraints`, as Chirp does), through
  `alter table` on Postgres, or not at all. The server holds them either way.
  The conditions are compared as the dialect renders them, so a rule written by
  hand that means the same but reads differently is refused. Write it with
  `entityChecks`.
- **A check of the application's own** under another name (`own_short_id`) is
  left alone.
- **An invariant that cannot compile** (an operator with no SQL, a value a
  constraint cannot hold) is refused by name when the CHECKs are derived, as
  `invariantChecks` refused it. `bind` derives only when the table holds a
  derived name, so a table with no CHECKs binds as before.

## Changing a rule

SQLite cannot alter a CHECK in place, so a changed rule means rebuilding the
table. `drizzle-kit` does that from the Drizzle table. A hand-written migration
recreates the table with `checkConstraints`' clauses, copies the rows, and puts
back what dropping the table took with it (triggers such as `rowChangeLog`'s).
On Postgres, drop the named constraint and add the new one. Rows the new rule
refuses fail the migration, which is where that should surface.

## In Chirp

`examples/chirp` had the drift the issue describes, `isMaxLength(280)` in the
domain and `check (length(body) <= 280)` in its SQL. Now:

- `body` is `isMaxCodePoints(280)`, which counts characters as people and SQL
  do. `handle` is `/^[a-z0-9_]+$/` and 3 to 15 long, the issue's own example.
- Its SQL interpolates `checkConstraints(Db.User)` and `checkConstraints(Db.Post)`,
  so it holds no rule of its own. The mutation that lets a post be any length
  now edits only the domain, and the database follows.
- Its server test writes a long post and a bad handle with raw SQL, and the
  database refuses both.

## Not done

- **Deriving whole tables.** Rejected above, not deferred.
- **Foreign keys from `Relation.one`, and `onDelete`.** Which Entity a column
  points at is the domain's. `onDelete` is a new relation option in
  `foldkit-entity`. A check that a declared `references()` points at the
  target's table would be cheap. Neither is built here.
- **Comparing the live database.** `bind` checks the Drizzle table. A
  hand-written migration is held to `checkConstraints` by a test, as
  `examples/cloudflare`'s migrations test holds `rowChangeLog`. Reading
  `sqlite_master` or `pg_constraint` at startup would compare text that
  `drizzle-kit` and Postgres format their own ways.
- **More exact rules.** `isInt` (`c = round(c)` agrees except at infinities),
  `isStartingWith` and its kin, case-insensitive patterns.
