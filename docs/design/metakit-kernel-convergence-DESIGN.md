# How do two expression languages become one?

Status: design, 2026-11-21. Nothing here is built. It is item 1 of Phase 1 of [the metakit unification plan](./metakit-unification-PLAN.md) ("the plan" below; "item 4" and "rule 9" name entries of its numbered lists). The work of that phase is handed out from this note, including the list edits, supplied inputs and Commands that `examples/todo-app` could not declare. It was checked against the tree at `d79b83402`.

## The problem, and the decision

This repository lets an application write a rule once, as data, so that the page, the server, the database and a checker all read the same rule. A checker is a program that shows, without running anything, that a rule cannot be broken. The repository has two ways of writing that data. The older one is in the package `foldkit-entity`, which defines kinds of stored row and the rules over them. The newer one is the package `metakit`, written this week. Each has its own tree of nodes, its own evaluator, its own checker and its own translation to SQL.

They do not mean the same thing. Take "the label equals `'x'`" over a row whose label is null. The older language answers "unknown", as SQL does, and the newer one answers "false". A rule moved from one to the other would change its answer and nobody would be told. The gap is visible in the code today: `packages/guard/src/check.ts` translates a few rules from the old form to the new, and hands every rule it cannot translate exactly to the prover as a function the prover cannot look into.

**Decision.**

- `foldkit-entity` keeps the functions you call today: `Expr.eq` to compare, `Query.where` to filter, `Mutation.update` to declare a write, `Entity.invariant` to state a rule every row must keep. What they build becomes metakit nodes.
- metakit gains what it needs to carry SQL's meaning: an equality and a membership test that answer null for a null, an order on text, and a fold of ASCII letters to lower case. It also gains operations an application defines, and one new kind of node for a question asked of many rows.
- The same new node kind reads and edits a list held in an application's state, by element, without a user-written function. A write names its way of writing (set, add, append, remove and so on). Each operation, fold and way of writing declares properties from a closed set of seven, in one table per kind, and whether two state changes can swap order is read from those.
- A transition takes the time and a new id as supplied inputs, and declares its Commands as a list of records that the application turns into Commands through one typed table. With these, 23 of the first application's 25 Messages can be declared; the other two have a declared footprint and a hand-written body.
- The old evaluator, the old checker for numbers and the second table of built-in operators are deleted. The move is made one reader at a time, behind a function that translates old nodes to new; the types of the expressions change in one last step, which breaks code that inspects a node's `_tag`.

A prototype measured the cost. A page that calls three constructors and evaluates the result ships 8,970 fewer compressed (brotli) bytes on metakit nodes than on today's. The same prototype counted the type checker's work over 165 expressions and found it no higher. Both readings are below, with what they do not cover.

## Words this note uses

- **Expression.** A rule or a computed value written as a tree of nodes, such as "balance plus hold is at least zero". Building one runs nothing.
- **Node kinds.** metakit has six (`packages/metakit/src/node.ts`). `Lit` is a constant, `Path` a read of a named value, `Call` an operation applied to arguments, `If` a two-way choice and `Match` a choice among literal cases. `Opaque` wraps ordinary code no reader can look into.
- **Reader.** A program that takes an expression and does something with it. Inside metakit they are evaluation, `Expr.judge`, SQL lowering, the checker, the solver and `Expr.reads`. `Expr.judge` evaluates over a partly known environment, which is what a page has. The solver is an optional second pass that gives the checker's open cases to the Z3 prover. `Expr.reads` lists what an expression reads.
- **Lowering.** Translating an expression into another form, usually SQL text.
- **Null, unknown, not held, refused.** A stored value can be null. SQL calls a comparison with null "unknown" and keeps a row only on true. A reader can also lack a value it would need, such as a row the page never loaded; this note calls that *not held*. A reader *refuses* when no two databases would agree on the answer, such as an integer past 2^53-1.
- **Entity, field, relation.** An Entity (`Entity.define`) is one kind of stored row. A field is one of its columns. A relation says a row points at another row; a `one` relation points at exactly one, as a post points at its author.
- **Invariant.** A rule every stored row of an Entity must keep. One that also reads the row before a write is a *transition invariant*; the others are *state invariants*.
- **Stored form.** A row as the database holds it: the encoded side of its Effect Schema, where a date is a number or text. (Effect is the library this repository is built on; its `Schema` describes a value's shape.) Both languages judge rows in this form (`HeldRow` in `packages/entity/src/held.ts`).
- **Environment, slice.** The named values an expression may read. Each top-level name is a slice: the row, the input of a write, and so on. In metakit an expression's type is `Expr<Env, A>`: `Env` is the environment it reads and `A` is the value it gives.
- **Path.** A read of the environment at a list of segments, such as `row.balance`.
- **Operation, core operation.** What a `Call` names (`num.add`). metakit has a closed set of 20 core operations (`CoreOpId` in `node.ts`), and every reader has a table with one entry per id.
- **Verdict.** metakit's three-valued answer of an analysis: `True`, `False`, or `Unknown` with a reason (`packages/metakit/src/verdict.ts`).
- **Sound.** An analysis is sound when it never answers `True` for something false. Answering `Unknown` more often keeps it sound.
- **Transition, footprint.** A transition is one state change written as data: a condition under which it applies (its guard), and a list of "this path becomes this value" (`packages/metakit/src/transition.ts`). Its footprint is the paths it reads and the paths it writes. A machine (`Machine.make`) is a state Schema with one transition per Message tag.
- **Foldkit, Model, Message, Command, Surface.** Foldkit is the TypeScript UI framework these packages extend. An application's state is its Model; a Message is an event the application handles in its `update` function; a Command is a side effect `update` asks the runtime to run, such as a focus or a timer. A Surface is a named part of the view, drawn again only when a Message writes a path it reads.
- **Partial evaluation.** Evaluating the parts of an expression whose inputs are known and keeping the rest, as `Expr.judge` and `Expr.residualize` do.
- **Sync, pending write.** `foldkit-sync` replicates part of the Model between devices. A pending write is one a page has applied locally and the server has not yet confirmed.
- **Collation.** The rule by which text is ordered and compared: by code point (`binary`), ignoring ASCII case (`asciiFold`), or by a database's locale.
- **Declared write.** `Write.update`, `Write.insert` or `Write.delete` in `packages/entity/src/write.ts`: what one request changes, stated over its input.
- **Wire name.** The name by which an operation travels between a page and its server (`number.add`), with a version.
- **Conformance suite, differential test.** The conformance suite is a set of cases run through every reader, each required to give the same answer. A differential test runs two implementations of one reader over the same cases.

## What does the same rule look like in each language today?

This is the older form. It names fields of an Entity.

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'

const Account = Entity.define(
  'Account',
  Schema.Struct({ id: Schema.String, balance: Schema.Int, hold: Schema.Int }),
)

export const covered = Expr.gte(Expr.add(Account.fields.balance, Account.fields.hold), 0)
export const shown = Expr.show(covered)
```

`shown` is the text `(Account.balance + Account.hold) >= 0`. The value `covered` is a `ComparePredicate` holding a `CallExpr` of the operator `number.add`, which holds two `FieldExpr` nodes: three of the node types of `packages/entity/src/expr.ts`.

This is the newer form. It names paths of an environment built from a Schema.

```ts
import { Schema } from 'effect'
import { Expr, Num } from 'metakit'

const Row = Schema.Struct({ id: Schema.String, balance: Schema.Int, hold: Schema.Int })

export const covered = Expr.in({ row: Row }, ({ row }) =>
  Num.gte(Num.add(row.balance, row.hold), 0),
)
export const shown = Expr.show(covered)
```

`shown` is the text `((row.balance + row.hold) >= 0)`. The value is a `Call` of `ord.gte` holding a `Call` of `num.add`, which holds two `Path` nodes. Both texts were printed by running each snippet with `tsx` in `examples/kitchen-sink`, which maps both package names. Once this design is built, the first snippet builds the second snippet's nodes, and prints as it does today.

## Where do the two languages disagree, and which meaning wins?

Each row was read in both sources. The first, the fourth and the fifth were also run in both, with `truthOver` of `foldkit-entity` and `Expr.evalResult` of metakit.

| Question | `foldkit-entity` today | `metakit` today | Wins |
| --- | --- | --- | --- |
| `eq` with a null side | unknown (`Eq` in `evaluate.ts`) | false: `eq.is` never gives null | entity, as a new operation |
| `in` with a null value, or a list holding null | unknown | false or true: `eq.in` never gives null | entity, as a new operation |
| `contains` | folds ASCII case first | `str.contains` is case-sensitive | both: the fold is its own operation |
| `startsWith` over half of a character outside the basic plane | false: by character (`memoryTable.ts`) | true: by UTF-16 unit (`ops/str.ts`) | entity |
| `add` past 2^53-1 | a double's answer, or Infinity | refused (`ops/num.ts`) | metakit |
| text `<` | by code point, under a collation | none: `ord.*` take numbers | entity, as new operations |
| text holding a NUL character, given to a comparison | refused | refused only by SQL lowering | entity |
| a rule that is null on a stored row | the row fails | the row fails (`Expr.refine`) | agree |
| a value the reader lacks | not held, kept apart from null | `Unknown`, kept apart from null | agree |
| `and`, `or`, `not` with null | SQL's three values | SQL's three values (`ops/bool.ts`) | agree |
| a comparison of numbers with null | unknown | null (`ops/ord.ts`) | agree |

The rule for a disagreement: the meaning SQL has wins, because SQL is the reader nobody can change. That gives entity five rows. The one row metakit wins is arithmetic past the safe integer range. There the databases themselves part (SQLite gives a real, Postgres refuses the statement), so refusing is the only answer every reader can keep; the standard-library note records the probe in its section 3.2.

So `Expr.eq(field, 'x')` over a null field answers unknown before and after. What changes is the node that says so.

Two things follow. First, the plan's table says metakit's evaluation of operations survives. That holds for the mechanism and not for every meaning: five of entity's meanings move into metakit. Second, the three kinds of "no answer" already line up. Entity's judge keeps SQL's unknown, a value not held, and a refusal apart (`Truth`, `Unheld` and `QueryEvaluateError` in `evaluate.ts`). metakit keeps a null value, an `Unknown` verdict and a `Refusal` apart. That is why one evaluator can serve both.

**Deleted.** Nothing by this section.
**Breaks.** For a metakit user, `Str.startsWith` and `Str.contains` over half a character answer by character. For an entity user, `Expr.add` and `Expr.sub` past the safe integer range are refused where today they give a double.

## Which metakit node does each entity node become?

A predicate stops being a separate type: it is an expression whose value is a boolean or null. The environment an Entity expression reads has the slices `row`, `next`, `input`, `viewer` and `now`; a later section explains each.

| Entity node (`expr.ts`, `context.ts`) | Becomes |
| --- | --- |
| `Literal` | `Lit` |
| `Field` of the judged row | `Path` `row.<key>`, typed by the field's stored form |
| a `one` relation read as a value | `Path` `row.<relation>`: the id it points at |
| `Next` (a field of the row a write leaves) | `Path` `next.<key>` |
| `Input` (a value a query or write is given) | `Path` `input.<key>` |
| `Viewer` (whoever asks, as a row of an Entity) | `Path` `viewer.<Entity>.id` |
| `Now` (the time of the write) | `Path` `now` |
| `Path` through `one` relations | `Path` `row.@<relation>.….<key>` |
| `ViewerPath` (a path starting at the asker's row) | `Path` `viewer.<Entity>.@<relation>.….<key>` |
| `Call` or `Test` of an operator defined by an expression | the nodes that expression builds |
| `Call` of `number.add`, `number.subtract` | `Call` of `num.add`, `num.sub` |
| `Test` of `text.startsWith` | `Call` of `str.startsWith`; operands folded under `asciiFold` |
| `Call` or `Test` of any other operator | `Call` of a foreign operation (see custom operators) |
| `Eq` | `Call` of the new `eq.equals` |
| `Null` (is null, or is not null) | `Call` of `null.isNull`, under `bool.not` for "is not null" |
| `Contains` | `Call` of `str.contains` over two `str.lowerAscii` calls |
| `In` | `Call` of the new `eq.among` |
| `And`, `Or`, `Not` | `bool.and`, `bool.or` (joined left to right), `bool.not` |
| `Compare` of numbers | `Call` of `ord.lt`, `ord.lte`, `ord.gt`, `ord.gte` |
| `Compare` of text | `Call` of the new `str.lt`, `str.lte`, `str.gt`, `str.gte` |
| `Exists` | the new node kind `Rows`, with the fold `any` |

`OrderTerm`, `ChosenOrder` and `Query` stay entity's own values. They are the shape of a query (which rows, in what order), and they hold expressions.

**New core operations for entity.** Each gets an entry in every reader's table, in the change that adds it, as the plan's rule 9 asks.

| Id | Meaning | SQLite | Postgres |
| --- | --- | --- | --- |
| `eq.equals` | equal; null when either side is null | `a = b` | `a = b` |
| `eq.among` | SQL's `in`, with its nulls | `a in (…)` | `a in (…)` |
| `str.lowerAscii` | A to Z lowered, every other character kept | `lower(t)` | `lower(t collate "C")` |
| `str.lt`, `str.lte`, `str.gt`, `str.gte` | text order by code point | `a < b` | `a < b collate "C"` |

SQL's `in` answers null for a null value, and for no match against a list that holds a null. The two `lower` forms fold ASCII letters only; the standard-library note probed both (its section 4.2).

Text order is four new operations, not a wider `ord.lt`. The checker's entries for `ord.*` reason about numbers (`comparison` in `packages/metakit/src/abstract/ops.ts`). An entry that had to ask "number or text?" of every operand could answer wrongly for text; an entry per type cannot.

**Two changes to existing operations.** `str.startsWith` and `str.contains` compare by character, and a lone half of a character reads as U+FFFD, as `beginsWith` in `packages/entity/src/memoryTable.ts` does. Text holding a NUL character is refused by every text and equality operation, with a new `Refusal` reason, `unportable`.

**A convenience the types gain.** Today a bare field on the right of a comparison is a type error: `Expr.gte(a.fields.x, a.fields.y)` needs `Expr.field(a.fields.y)`. The prototype's constructors took a field on either side, and the built ones should.

**Where a field's identity goes.** A `FieldExpr` holds its Entity's identity, so two Entities with one name are not confused. A `Path` holds segments and a Schema. Entity makes one `Path` node per field and slice, and keeps a `WeakMap` (a table keyed by the node object) from that node to the field's Entity, key and collation; this note calls it the origin map. The checks made while an expression is built read it: `Query.where` refusing another Entity's field, `Expr.exists` refusing a filter that reads past its row, a comparison choosing a collation. No reader needs it after that.

**Names for printing.** A call of an operator defined by an expression disappears into what it means. Its name is kept for `Expr.show` and `Query.operators` in a second `WeakMap`, from the built node to the operator, as `nameNode` in `expr.ts` does for a named state today.

**Deleted.** In `packages/entity/src/expr.ts`: the `Predicate` union and its ten interfaces, `isPredicate`, `Expr.expanded`, `Expr.substituteNext` (metakit's `Node.substitutePaths` does it), and the walker under `dependenciesOf` (it becomes `Expr.reads` plus the origin map).
**Breaks.** Code that reads a node's `_tag` (`'Eq'`, `'Compare'`, `'Field'`) reads metakit nodes instead. Outside entity, a search of `packages/*/src` for those tags finds `packages/remote-drizzle/src/compile.ts` and `packages/guard/src/check.ts`. `Predicate` stays as a type name, for "an expression giving a boolean or null".

## How is a hop through a relation written, and how is `exists`?

**A hop is a path.** "The handle of this post's author" is today a `PathExpr` holding the relation and the field. It becomes the `Path` `row.@author.handle`. The segment `@author` names the row the relation `author` reaches. It is kept apart from `row.author`, the id stored on the post. The two differ today: the id is read whether or not the reader may see the author, and the hop reads null when they may not (`PathExpr` in `expr.ts`). `Entity.define` refuses a member whose key starts with `@` or `<`; the second mark is used below.

A hop reads null when the link is null or reaches no row, so its type is `Path<Env, T | null>`, as `Expr.path` types it today. No reader needs a new rule for it:

- In memory, entity builds the environment from the rows a page holds. A row it holds is a nested object under `@author`, a null link is `null`, and a row it does not hold is left out. `Expr.judge` already answers `Unknown` for a key that is left out and reads `null` as a value (`lookupPartial` in `packages/metakit/src/ops/residualize.ts`).
- In SQL, metakit's lowering returns the column's segments (`SqlPiece.Column` in `sqlLowering.ts`). `foldkit-remote-drizzle` renders more than one segment as the subquery it writes for a `PathExpr` today (`atRow` in `compile.ts`).
- The checker and the solver see a nullable field they know nothing more about, which is sound.
- `Expr.reads` returns the segments, so the plan's graph of what reads and writes what gets the Entity, the relations followed and the field.

**`exists` needs a seventh kind of node.** Take an Entity `Follow` whose `one` relation `followee` points at a user. "Some follow row points at this author, and its follower is me" asks a filter of each follow row. A `Call` cannot say it. A call's arguments are evaluated once, in the caller's environment, before the operation runs (`Node.apply` and the `Call` case of `evalNode`). An operation therefore receives the filter's one answer, not a filter it could ask of each row. Putting the filter in a literal would hide what it reads from `Expr.reads` and from SQL. So metakit gains one node kind, `Rows`, with these fields:

- `fold`: one of `any`, `every`, `count`, `sum`, `min`, `max`, `find`, `keep`, `patch`.
- `over`: either the rows pointing at a row through a `one` relation (`of`, a `Path` to the row asked about, and `relation`), or a `Path` to a list held in the environment.
- `where`: an optional node, the test each element must pass.
- `value`: a node, for `sum`, `min`, `max` and `find`.
- `set`: for `patch`, a record of field name to node.

`where`, `value` and `set` read the element under the slice `each`. For related rows they may also read `input`, `viewer` and `now`, and never `row`. That is today's rule for an `exists` filter (`existsOf` in `expr.ts`), and it means no reader carries a second row into the body. `Expr.exists(relation, where)` builds `Rows` with the fold `any`. `every`, `count`, `sum`, `min` and `max` are the row aggregates of the plan's item 3; their bodies are the expressions `packages/metakit/src/aggregates.ts` holds today, read under `each`. Lists, and the folds `find`, `keep` and `patch`, are the next section's.

Every function in metakit that visits nodes branches on the kind through `Node.$match`, which requires a case for each kind. A seventh kind therefore fails to compile in each of them until it is handled, as a new operation does in each table.

| What reads it | What it does with `Rows` over related rows |
| --- | --- |
| Evaluation over a whole environment | folds the rows found under `of` |
| `Expr.judge` over held rows | the same when all rows are held; with some held, see the properties section |
| SQL lowering | a piece its caller renders as a subquery; metakit lowers `where` and `value` |
| Checker | `sum` and `count` by the write's change to them; the rest `Unknown` |
| Solver | as the checker, until the plan's item 8 adds a bounded search |
| `Expr.reads` | `of`, the relation, and the body's reads of `input`, `viewer`, `now` |

The environment holds the pointing rows under the row asked about, at a segment that names the relation in reverse, `<Follow.followee`. Its value is `{ rows, whole }`, where `whole` says whether these are all of them. Entity fills it from `HeldRow.pointing`, which already answers both (`held.ts`), and keeps `Judge.pins`, which decides when a page holds them all.

**Deleted.** `PathExpr`, `ViewerPathExpr`, `ExistsPredicate` and the code that walks them in `expr.ts` and `evaluate.ts`.
**Breaks.** A member key starting with `@` or `<` is refused. `Expr.path` and `Expr.exists` keep their signatures.

## How does a collation reach a text operation?

It does not reach one. The kernel has one text order, by code point, and one fold, `str.lowerAscii`. A collation stays a declaration on an Entity's field (`Collation.of` in `packages/entity/src/collation.ts`). Entity's constructors read it when they build a text comparison:

- `binary`: the operands are compared as they are.
- `asciiFold`: each text operand is wrapped in `str.lowerAscii`.
- a database's locale: refused where the comparison is built, as today. It stays legal on an order term only, which is query structure and is compiled only to SQL.

So `Expr.lt(Product.fields.name, input.from)`, over a field declared `asciiFold`, builds `str.lt(str.lowerAscii(row.name), str.lowerAscii(input.from))`. A collation given to one call (`{ collation }`) picks the wrapping for that call. The rules that choose a call's collation (`collationFor` and `callCollation` in `expr.ts`) stay, since they run while the expression is built.

Every reader then handles a collation through its ordinary table entry for `str.lowerAscii`, and nothing is passed alongside the expression. One reader needs care. A database uses an index for `name collate nocase < ?` and not for `lower(name) < ?`. `foldkit-remote-drizzle` already chooses the indexed form when a column has one (`collatedColumn` in `compile.ts`). It keeps doing so: before it calls metakit's lowering, it looks for a text comparison whose sides are `str.lowerAscii` of a column and of a value, and writes the indexed form for it.

**Deleted.** The `collation` member of `ComparePredicate`, `CallExpr` and `TestPredicate`; `OperatorContext.collation` in `packages/entity/src/operators.ts`; `SqlContext.collate` in `packages/remote-drizzle/src/operators.ts`.
**Breaks.** A custom operator's implementation that read `context.collation` receives folded text instead. A computed assignment's wire form loses its `collation` field (see the wire names).

## How are a custom operator and its implementations carried?

An application defines an operator with `Expr.operator`. There are two sorts (`OperatorDescriptor` in `expr.ts`).

**Defined by an expression** (the option `definedAs`). The call is replaced by the nodes its body builds, when it is called. Every reader reads those nodes, so the operator needs nothing anywhere. This is today's meaning with the wrapper node removed.

**Primitive.** Each reader implements it: a JavaScript function in memory, an SQL builder on the server. It becomes a `Call` of a *foreign operation*: one whose id is outside metakit's closed set. Its descriptor, `ForeignOp`, holds the `id` and `version` that `Expr.operator` was given; `returns`, whether it gives a number, a boolean or text; `nulls`, whether a null argument gives null without asking the implementation; and `laws`, the properties the operator declares. The last three come from the operator's Schemas and options. It holds no evaluator.

A core operation carries its evaluator in the node, which is how a page ships only the operations it names. A foreign one carries none, because a page and a server can hold different implementations of one operator, or the page none at all. Each reader takes a table of foreign implementations from its caller and has one explicit branch for a foreign call:

| What reads it | With an implementation | Without one |
| --- | --- | --- |
| Evaluation | runs it, under the operation's null rule | a `Refusal`, reason `unsupported`, naming it |
| `Expr.judge` | runs it | `Unknown`, as entity's judge answers today |
| SQL lowering | calls the builder with the lowered arguments | refuses the statement, naming it |
| Checker, solver | does not apply | `Unknown` |

The plan's table sends a primitive operator to an `Opaque` node. That would lose it. An `Opaque` node holds one function of the whole environment, so SQL could not see its arguments (`sqlLowering.ts` refuses every `Opaque`), and it has no name to send to a server. A foreign call keeps the arguments, the name and the version.

**What you change.** A primitive operator's declaration and its implementations stay as written (`Operators.implement`, `Operators.memory`, `DrizzleOperators`), with two exceptions: an implementation that read `context.collation`, and an id under a prefix that becomes reserved. The three built-in operators leave those tables, since `num.add`, `num.sub` and `str.startsWith` carry their own evaluators and SQL.

**Deleted.** `kernelOperators` and its three implementations in `packages/entity/src/memoryTable.ts`; the built-in rows of `packages/remote-drizzle/src/operators.ts`; `runWith`, `ran`, `called` and `applyOperator` in `evaluate.ts`.
**Breaks.** `Operators.kernel` no longer lists `number.add`, `number.subtract` and `text.startsWith`. An application id under `number.`, `text.`, `num.`, `str.`, `eq.`, `ord.`, `bool.`, `null.`, `arr.` or `rows.` is refused, as `foldkit.` is today.

## How are an insert and a delete transitions, and where do the time and a new id come from?

A metakit transition changes paths of one state. A declared write changes one row of a table, and an insert and a delete change whether the row is there. So the state of a write's transition is the row's place in the table, not the row: a struct `{ present, row }`, where `present` is a boolean and `row` is the Entity's row in its stored form. Its input is the write's input.

**Supplied inputs.** A transition gains a third slice, `supplied`, beside `state` and `input`. It holds values no caller passes and no state holds: the time, a new id, who asks. A transition declares each with a Schema (`supplied: { now: Schema.Int, id: Schema.String }`). Whoever runs the step reads the clock or makes the id once and passes them: `Transition.step(transition, state, input, supplied)`. A proof treats them as free values of their Schemas, and a replay passes the recorded ones, so a step stays a pure function of its arguments. In an application, the plan's Phase 3 binds them when the Message is sent and records them in it, so the server, a replay and another device run the step with the same values. This is the rule the standard-library note set for the clock, extended to ids. The plan's item 14 also forbids a guard that reads a supplied id; that is not adopted, since a proof already holds for every id.

A new function, `transitionOf(write)`, returns one metakit `Transition` over that state.

| Write | Applies when | Writes |
| --- | --- | --- |
| update | `present`, and the write's own conditions | each set, increment and computed field |
| insert | not `present` | `present` to true, and each field the insert sets |
| delete | `present`, and the write's own conditions | `present` to false |

A write's own conditions are its `when`, the named state it starts `from`, and the revision it `expect`s the row to be at. Each part of a write has a plain reading:

- A set is "`row.<field>` becomes `input.<key>`".
- An input key that may be left out writes "the key if given, else the field as it was". Evaluation reads a key that is left out as null, so a transition cannot tell "not given" from "given as null". Where the field cannot hold null the write is an `If` on the key being null. Where it can, the written value is an `Opaque` node that reads both paths, and a rule over that field is `Unknown` to the checker.
- An increment is `Transition.add(row.stock, input.quantity)`; a decrement adds the negated amount, as `Write.bind` does today.
- A computed field is its expression, with `row` read under `state.row`.
- What the write's context sets (`Entity.sets`: who asks, when) reads `supplied.viewer` and `supplied.now`. Every read of the expression slices `viewer` and `now` inside a write's transition becomes a read of these two.
- The expected revision joins the condition as an `eq.equals`. Its new value is the store's to choose, so it is written as an `Opaque` value.
- A field an insert does not set is not written. Its value before is unconstrained, which is what "the store decides it" means to a checker.

A rule is translated the same way. `row.x` is `state.row.x`. `next.x` is the value the transition writes to `row.x`, or `state.row.x` where it writes none. A rule binds only a row that is there: the checker assumes that `present` implies each state invariant before the write, and must show it after. Three answers that `Laws.check` gives today without examining the rule then follow from the transition (`judgeWrite` in `packages/entity/src/laws.ts`). A delete keeps every rule, since `present` is false after it. An insert keeps every transition invariant, since there was no row before. An update that writes nothing a state invariant reads keeps it.

`Write.footprint` stays computed from the write's own lists, as today, so that the main entry needs no `Transition`. A test holds it equal to the footprint of `transitionOf(write)` over the row's fields. The write to `present` is visible on the transition only; the plan's graph reads it as "which rows exist", which every query over the Entity reads.

metakit's checker needs one addition. `Abstract.checkTransition` answers one verdict for all the rules on a state Schema together (`packages/metakit/src/abstract/check.ts`). `Laws.check` reports each write against each rule, and a rule may read the row before. So the checker gains an entry that takes a transition, what may be assumed, and one goal over the state before, the state after and the input, and answers one `Verdict`.

**Deleted.** `packages/entity/src/bounds.ts`, the number half of `Laws.check`, once the plan's differential test passes.
**Breaks.** `Write.apply`, a page's prediction of a row, leaves a field unknown where an increment or a computed value is refused.

## How is a list in an application's state read and changed?

The first application rewritten onto transitions, `examples/todo-app`, cannot state ordinary edits today: add an item, remove or change the item with a given id, ask whether any item is done, trim a title. metakit has two list operations, `arr.count` and `arr.isEmpty`, and a transition writes a path that is fixed when it is declared (`Transition.set` in `transition.ts`).

**Reading a list** uses `Rows` with `over` a list. You write the test as an arrow that metakit calls once, while the expression is built, with a path for the element: `Arr.any(state.todos, todo => todo.completed)`. The arrow is not kept. What is kept is the expression it returned, read under `each`, so every reader sees the test as nodes and `Expr.reads` sees what it reads. A body cannot call itself and has no loop, and in this phase it holds no second `Rows`. Besides `each`, a list body may read every slice around it; only a body over related rows is limited, because it lowers to SQL.

| Constructor | Fold | Gives |
| --- | --- | --- |
| `Arr.any(list, test)`, `Arr.every` | `any`, `every` | a boolean: some element, or every element, passes |
| `Arr.count(list, test)` | `count` | the number of elements that pass |
| `Arr.sum(list, value, test?)`, `min`, `max` | the same names | a number over `value` of the elements that pass |
| `Arr.find(list, test, value?)` | `find` | `value` of the first element that passes (the element itself without one), or null |
| `Arr.keep(list, test)` | `keep` | the elements that pass, in order |

A test that gives null does not pass, as a row is kept only on true. Over an empty list, or none that pass, `any` is false, `every` true, `count` and `sum` 0, and `min`, `max` and `find` null. A null list gives null.

**Writing a list** is a way of writing, named on the write. Each constructor builds the value the path becomes, so the evaluator still sees "this path becomes this value". The way of writing is recorded beside the write for the readers that decide from it (the properties section).

| Constructor | The list becomes |
| --- | --- |
| `Transition.append(list, element)` | the element added at the end (the new core operation `arr.append`) |
| `Transition.insert(list, element)` | the element added at the end, unless an element has its key |
| `Transition.remove(list, key)` | the list without the elements with that key |
| `Transition.removeWhere(list, test)` | the list without the elements that pass |
| `Transition.patch(list, key, set)` | each element with that key changed by `set` (the fold `patch`) |
| `Transition.patchWhere(list, test, set)` | each element that passes changed by `set` |
| `Transition.include(list, value)`, `exclude` | a sorted list of scalars, with the value added or taken out |

`element` is a record of field name to expression, as a transition's `emits` already takes (`EmitTemplate` in `transition.ts`), or an expression that gives a whole element, such as `input.todo`. `set` is an arrow, called once with the element's path, that returns a record of field name to expression. The key is the element Schema's `id` field unless the constructor names another. A key that no element has changes nothing, and the step returns the list it was given, so a no-op keeps the Model's identity.

`include` and `exclude` are adding to and removing from a set. A set in state is a list of scalars kept in ascending order (by code point for text): `include` puts the value at its place unless it is there, and `exclude` takes it out. The order is a function of the contents, which is what lets two includes swap; an appended list's order shows which came first. They are the new core operations `arr.include` and `arr.exclude`.

**Footprints name elements.** A path segment `*` stands for every element. `patch` of `completed` writes `todos.*.completed` and reads `todos.*.id` and what its `set` reads. `append`, `insert`, `remove`, `removeWhere`, `include` and `exclude` write `todos` itself, since they change which elements are there. A fold reads `todos.*.<field>` for each field its body reads. Paths meet by prefix, `*` matching any one segment, so a Surface drawing `todos.*.title` is not drawn again for a change of priority.

**Text and absence.** Trimming is the core operation `str.trim`, brought forward from the plan's item 8: space, tab, line feed and carriage return, the set the standard-library note found every database can match. "This or else that" is `null.coalesce`, brought forward from the same item.

**Optional values are read and written as nullable.** An application's state holds Effect's `Option` (`Option.some(x)` or `Option.none()`), declared with `Schema.Option` or, as the todo Model does, `Schema.OptionFromNullOr`. A path to such a field reads as the value or null, so `state.undo.id` is the id when there is an undo and null when there is none. A write of the value or null to such a path stores `Option.some` or `Option.none()`. So `Transition.set(state.editingId, input.id)` and `Transition.set(state.editingId, null)` type-check, because the target's type is `string | null`; that removes today's failure to infer `Option.none()`. No operation builds or opens an `Option`. An `Option` of a nullable type is refused when the path is made, since its none and its some of null would read alike. The checker reads the field as nullable, and SQL never meets one, since a stored row holds null.

| What reads it | A fold over a list, and the list operations |
| --- | --- |
| Evaluation, `Expr.judge` | exact; `Unknown` in `Expr.judge` when the list is not held |
| SQL lowering | refused, naming the fold: a list in a column is not lowered in this phase |
| Checker | the length: one more after `append`, the same or one more after `insert`, not more after `keep` |
| Solver | `Unknown`, with the reason `unsupported` and the fold's name |
| `Expr.reads` | the list's path with `*`, and what the body reads outside `each` |

**Deleted.** Nothing.
**Breaks.** A path to an `Option` field is typed `T | null`, not `Option<T>`; `examples/todo-app/src/machine.ts`, which compares `state.editingId` with an `Option.none()` constant, tests for null instead.

## How are Commands declared?

Today a transition's `emits` describes one record per step, computed from the state before the change (`step` in `transition.ts`), and nothing turns it into a Command. So the todo application runs its transitions inside hand-written `update` arms that add the Commands (`src/app.ts`).

**In metakit, `emits` becomes a list.** Each entry is `Transition.emit(tag, fields, { when })`: a tag, a record of field name to expression, and an optional condition. A step returns the entries whose condition is true, each evaluated over the state before the change, as today. That is what the todo Commands read: the edit's end renames the todo whose id the same step clears. A Command that needs the state after reads the written value's expression. The emitted fields join the transition's reads, as they do today (`footprint` in `transition.ts`).

**On the Foldkit side, one table per machine turns records into Commands.** It maps each emitted tag to a function from the record to a Command, and is typed by the machine's tags, so a tag with no entry does not compile. From the machine and that table, the plan's Phase 3 builds `update`; no arm is written by hand. The function is ordinary code, which is allowed because a Command runs after the step, not inside it. It may do what the language cannot. When a todo is deleted, focus moves to the next row in the order shown, sorted by priority; the record carries `state.todos` and `state.filter`, and the function sorts. A durable fact sent on (`fact(Message.DeletedTodo({ id }))`) is the same: its entry builds the Message.

**Drift ends by construction.** `WritesCheck.verify` compares what an `update` arm changed with what its Message's transition declares. When the arm only runs the transition, both come from one declaration, so the check cannot see a transition that is itself wrong. Once `update` is built from the machine, that check has nothing to compare for a declared Message, and a wrong transition is found by its tests and by the checker against the rules. `WritesCheck.verify` stays for what still has a body: `Transition.opaque` (below) and arms written by hand.

**Deleted.** Nothing in metakit.
**Breaks.** `emits` returns a list, and `Machine.update` returns the list of emitted records in place of one `Option`.

## Which of the first application's Messages become declarable?

`examples/todo-app` was rewritten at `70585f667`. Of its 25 Messages, 11 got a transition (`src/machine.ts`), and 5 of those still have hand-written Commands. This is what the other 14 become, and where the Commands go; the "supplied" row and the last row are about Commands, and `RequestedTodo` and the four Messages in the last row are among the 11. "Operation" means the kernel states it; "supplied" means a supplied input; "outside" means a declared footprint with a hand-written body.

| Messages | Becomes | Kind |
| --- | --- | --- |
| `ToggledTodo` | `patch(todos, input.id, todo => ({ completed: not(todo.completed) }))` | operation |
| `RenamedTodo`, `PrioritySet` | `patch` setting `title` or `priority` from the input | operation |
| `DeletedTodo`, `ClearedCompleted` | `remove(todos, input.id)`; `removeWhere(todos, todo => todo.completed)` | operation |
| `SubmittedTodo`, `RestoredTodo` | `insert(todos, …)`; the id is already in the Message | operation |
| `EditingStarted` | `editingId` := `input.id`; `editDraft` := `coalesce(find(…, todo => todo.title), '')` | operation |
| `DeleteRequested` | `undo` := `find(…)`; three emitted Commands | operation |
| `UndoExpired` | guard `eq.equals(state.undo.id, input.id)`; `undo` := null | operation |
| `DraftSubmitted`, `RenamedList` | guard on `str.trim`; `draft` := `''`, or `listTitle` := the trimmed title | operation |
| `DraftSubmitted`, `RequestedTodo` | the new todo's `id` and `now` supplied, sent on in an emitted `SubmittedTodo` | supplied |
| `UrlChanged`, `MirrorRestored` | `foldkit-mirror`'s own step, with a declared footprint | outside |
| Commands of `EditingCommitted`, `EditingSubmitted`, `EditingStopped`, `UndoRequested` | emitted entries with conditions | operation |

So 23 Messages (the 11, and 12 of the 14) become transitions with no hand-written `update` arm; what stays code is the functions that build Commands from records. A guard that is null or false refuses the step, and `Machine.update` then returns the state it was given, which is the no-op the hand-written arms of `UndoExpired`, `RenamedList` and `DraftSubmitted` have today. The command that minted the id and time (`mintTodo` in `app.ts`) disappears: the runner supplies both.

**Code that stays code.** `UrlChanged` parses a URL, and `MirrorRestored` decodes stored strings through each field's Schema (`restoreKeys` in `packages/mirror/src/index.ts`). Neither is an expression, and a record read by key would not make the second one. Such a Message is still declared. `Transition.opaque` takes the state and input Schemas, the paths the body reads and writes, and an ordinary function for the body; `foldkit-mirror` already lists the fields a mirror writes (`fields.dependencies`). Its footprint is the declared one. The checker answers `Unknown` for every rule that reads a path it writes, and `WritesCheck.verify` fails in development when the body writes a path it did not declare.

**What a page that runs transitions carries.** The rewritten page grew by 4,209 brotli bytes: twelve metakit modules, the largest `ops/residualize` at 3,375 minified bytes and `transition` at 2,248, measured by the example's `test/bundle.test.ts`. (The prototype page below reads `ops/residualize` at 3,366; the two builds keep slightly different parts of it.) Running a step needs evaluation and a write at a path, and no partial evaluation. Two imports bring `ops/residualize` anyway. `transition.ts` imports `judgeNode` for `Transition.can` and `readsOfNode` for `Transition.footprint`. And `Machine.make` calls `footprint` for every transition and returns an object holding `canDispatch` and `affordances`, which call `can`. Step 3 moves `readsOfNode`, a walker that needs no partial evaluation, to a module of its own, `ops/reads.ts`. It moves `can`, `canDispatch` and `affordances` to functions in a module of their own, still exported from `metakit/machine`. A build test then holds that a page which runs transitions and reads footprints has no `ops/residualize`. The page's other arrival, `metakit/graph` through `foldkit-surface/writes`, is the plan's Phase 2 item 1.

**Two type errors.** An unannotated transition with `emits`, exported from a project that emits declarations, fails with TS2883 today, because its inferred type names `PathAccessor`; step 1 exports that type from metakit's main entry. The failure to infer `Option.none()` ends with the nullable reading above.

**Deleted.** `canDispatch` and `affordances` as members of a machine.
**Breaks.** `machine.canDispatch(tag, partial)` becomes `Machine.canDispatch(machine, tag, partial)`, and the same for `affordances`; the callers are `packages/agent/src/metakit.ts` and `examples/metakit/src/demo.ts`.

## Which properties does an operation, a fold or a way of writing declare?

A reader can skip work when it knows a fact about an operation: that adding zero changes nothing, or that two additions to one total can swap. Both packages declare such facts today, in three shapes. metakit's operations carry five rewrite rules (`OpLaws` in `node.ts`: `identity`, `absorbing`, `idempotent`, `reflexive`, `involution`), which partial evaluation applies. Entity's operators carry nine kinds of `Law` (`law.ts`), of which only `Monotonic` has a reader, the old number checker. metakit's aggregates are marked `group` or `semilattice` (`aggregates.ts`), which says whether a change updates a total or forces a rescan.

They become one closed set of seven properties. Nobody constructs an object that stands for an algebra: a property is a field of a type, and each kind of thing has one table keyed by its closed set of names.

| Property | Says | Decided from it |
| --- | --- | --- |
| identity | an argument value leaves the other argument as it is | partial evaluation; the starting value of a total |
| absorbing | an argument value decides the answer | partial evaluation; `Expr.judge` over some of the rows |
| idempotent | twice is once: `op(x, x)` is `x`, or `f(f(x))` is `f(x)` | partial evaluation; a write delivered twice by sync or replay |
| commutative | two arguments, or two writes, can swap | `Transition.commutes`; sync convergence; replaying a pending write |
| associative | grouping does not matter | combining many changes into one total |
| invertible | a named operation undoes it | updating a total on a delete instead of rescanning; undoing a failed write |
| monotone | per argument, a larger value never gives a smaller answer, or never a larger | the checker's bounds; `Expr.judge` over some of the rows |

A property is declared on a given operation only under two conditions. The conformance suite generates a check of it against the evaluator, over the awkward values of its types: null, a refusal, NaN, zero, the ends of the safe range. And a reader in the table above decides something from it. A property whose check fails is not declared. Integer addition is associative only where neither grouping is refused, so it is declared "associative unless refused", and a reader that combines changes in another grouping rescans on a refusal. `reflexive` and `involution` stay as rewrite rules of partial evaluation alone: two further fields of the same type, outside the seven, because no later phase decides anything from them. Entity's `Associative`, `Commutative`, `Idempotent`, `Identity`, `Absorbing`, `Inverse` and `Monotonic` map onto the set; `Distributes` has no reader and is dropped; `PreservesCollation` goes with collations.

**Where they live.** In a new `packages/metakit/src/properties.ts`. A type `OpProperties` has an optional field per property: an identity names its value and side, an inverse names an operation id, monotone gives a direction per argument. A table `opProperties` is typed `{ readonly [Id in CoreOpId]: OpProperties }`, so an operation with no row does not compile. `Op.laws` is deleted from the descriptor. Partial evaluation reads `opProperties[op.id]`, the checker's monotonicity in `abstract/ops.ts` reads the table instead of keeping its own, and the conformance suite generates its checks from it. The same file holds `foldProperties`, keyed by fold, and `writeProperties`, keyed by way of writing. A foreign operation carries its declared properties on its descriptor, and no reader acts on them in this phase.

One cost follows. A page that runs `Expr.judge` carries the whole table, where today it carries the laws of the operations it names. The table is data, and step 1 measures it. If it breaks the plan's rule 4 on bytes, the table is split by family (`properties/num.ts`, …), each typed by its family's ids.

**Operations.** The table below is the proposal. Step 1's generated checks are the verdict, and step 1 reports any property it drops.

| Operation | Declares | Reader |
| --- | --- | --- |
| `bool.and` | identity `true`; absorbing `false`; idempotent; commutative; associative | partial evaluation; the fold `every` |
| `bool.or` | identity `false`; absorbing `true`; idempotent; commutative; associative | partial evaluation; the fold `any` |
| `bool.not`, `num.neg` | involution; `num.neg` also monotone down | partial evaluation; the checker |
| `eq.is`, `eq.isNot` | reflexive | partial evaluation |
| `num.add` | identity 0; commutative; associative unless refused; inverse `num.sub`; monotone up, up | the fold `sum`; the way `add`; the checker |
| `num.sub` | identity 0 on the right; inverse `num.add`; monotone up, down | partial evaluation; the checker |
| `num.mul` | identity 1 | partial evaluation |
| `str.lowerAscii`, `str.trim` | idempotent | partial evaluation |
| `null.coalesce` | identity null; idempotent | partial evaluation |

No other operation declares anything. `eq.is` is commutative and `num.mul` associative, but no reader decides from either, so neither is declared.

**Folds.** `group` and `semilattice` stop being declared and are read off the properties. A fold over `num.add` or `bool.and` takes that operation's properties.

| Fold | Declares | What follows |
| --- | --- | --- |
| `sum`, `count` | from `num.add`: commutative, associative unless refused, identity 0, invertible | any change moves the total by one delta |
| `count` | also monotone up in the rows | `count >= n` holds once `n` held rows pass |
| `min`, `max` | commutative, associative, idempotent; monotone down, up in the rows | a delete of the extreme rescans |
| `every`, `any` | from `bool.and`, `bool.or`, so absorbing `false`, `true`; monotone down, up | `any` holds once one held row passes |
| `find`, `keep`, `patch` | nothing | order shows, or the result is a list |

**Ways of writing.** The plan calls them write operators. Today a transition has one, `Transition.set`. Entity's declared write has more (`write.ts`): a set from an input key, an increment or decrement, a computed field, a link to another row, a value set from the write's context, and the revision moved on. A pending write in `foldkit-remote` keeps the same split as absolute values, relative `adds` and `computes` (`PendingPatch` in `packages/remote/src/ledger.ts`). Each write of a transition names one way:

| Way of writing | Entity's write parts | Two on one path | Twice | Undone by |
| --- | --- | --- | --- | --- |
| `set` | sets, links, context values, computed fields, revision | commute only for one literal value | the same, unless the value reads the path | nothing |
| `add` | increment, decrement | commute, from `num.add` | not the same | `add` of the negated amount |
| `append` | none | do not commute: order shows | not the same | nothing |
| `insert` | none | do not commute: order shows | the same as once | nothing |
| `remove`, `removeWhere` | none | commute; with a `patch` when the test reads no field it sets | the same as once | nothing |
| `patch`, `patchWhere` | none | see the next section | the same, when `set` reads no field it sets | nothing |
| `include`, `exclude` | none | commute, unless one of each with one value | the same as once | nothing |

A way's property is derived from its operation where it has one: `add` commutes because `num.add` is commutative and associative. A computed field is a `set` whose value may read the path itself, so it claims nothing. The revision is a `set` of an `Opaque` value and never commutes; that is its purpose. An insert and a delete of a row are `set`s of `present`.

**Deleted.** `algebra` and `requiresRescanOnDelete` on an aggregate (`aggregates.ts`); `Op.laws` and `OpLaws` (`node.ts`); entity's `Law` kinds `Distributes` and `PreservesCollation` (`law.ts`).
**Breaks.** An aggregate's `algebra` field is gone; a caller asks `foldProperties`. `packages/remote/src/aggregate.ts` branches on the aggregate's `_tag`, not on `algebra`, so it is unaffected; only `packages/metakit/test/aggregates.test.ts` and `packages/metakit/docs/domain-types.md` name the field.

## Do two transitions commute?

Two transitions commute when running them in either order, from any state, gives the same state and the same emitted records, and neither order refuses where the other does not. The plan's later phases must test every pair that does not, so the kernel answers the question from declarations first. `Transition.commutes(a, b)` returns a `Verdict`:

1. If either footprint is unbounded (an `Opaque` value or a `Transition.opaque` that names no reads), the answer is `Unknown`.
2. Paths meet by prefix, with `*` matching any one segment. A write to `todos` meets a read of `todos.*.title`; a write to `todos.*.completed` does not.
3. If one writes a path the other reads, in its guard, a written value or an emitted record, the answer is `Unknown`. Reads that belong to a way of writing on the path it writes are left to rule 4: the total `add` adds to, and the key, test and `set` of a list write.
4. If both write paths that meet, the answer is `True` only for the pairs `writeProperties` lists as commuting. Those are two `add`s; two writes each a `remove` or `removeWhere`; two `include`s, two `exclude`s, or one of each with different literal values; and two `set`s of one literal value. Two `patch` or `patchWhere` writes commute when they set different fields and neither's key, test or `set` reads a field the other sets. A `patch` and a `remove` or `removeWhere` commute when the removal's test or key reads no field the patch sets. Every other pair that meets is `Unknown`.
5. Two `add`s could be refused in one order and not the other, by a total that passes 2^53-1 and comes back. The checker must show both intermediate totals stay in range, or the answer is `Unknown`.
6. Otherwise the answer is `True`.

`Unknown` carries an obligation of the kind `walk`, which `verdict.ts` already has: a test must run the pair in both orders. The answer is never `False` from declarations; only a run finds a counterexample.

In the todo application, `ToggledTodo` (a `patch` of `todos.*.completed`, reading `todos.*.id`) and `RenamedTodo` (a `patch` of `todos.*.title`) commute: `True`. So do `RenamedTodo` and `ClearedCompleted`, since the clearing reads only `completed`. `ToggledTodo` and `ClearedCompleted` do not decide: the second's test reads `todos.*.completed`, which the first writes, so the answer is `Unknown` with a walk. A walk finds that they do not commute: toggling a todo to done and then clearing removes it. Two `SubmittedTodo`s are two `insert`s, `Unknown`, since the list's order shows which came first.

The same table answers the plan's other two questions. Replaying a pending write over a newer server value is exact for `add`, `remove`, `removeWhere`, `include`, `exclude`, and a `patch` of fields the newer value did not change; a `set` replaces the newer value, as `foldkit-remote`'s absolute values do today. Two devices converge without a tie-break on writes that commute; the others keep the order sync gives them.

**Deleted.** Nothing.
**Breaks.** Nothing; `Transition.commutes` is new.

## What environment does an Entity expression read, and how is it typed?

| Slice | Holds | What may read it |
| --- | --- | --- |
| `row` | the judged row, stored form, with reached rows under `@relation` | every expression |
| `next` | the row a write leaves | an invariant; a write's declared end state |
| `input` | the values a query or write was given | a query, a write, an `exists` filter |
| `viewer` | per Entity name, the row of whoever asks, or null | a query, a permission rule, `Entity.sets` |
| `now` | the time of the write, in milliseconds | a permission rule, `Entity.sets` |
| `each` | the element, inside a `Rows` body | that body only |

Reading a slice where it is not allowed is refused where the expression is handed to what uses it, as today. `declared` in `write.ts` refuses a `when` that reads the viewer, and `declareOn` in `invariant.ts` refuses an invariant that reads the input. Those checks become one shared function over `Expr.reads`: "this use forbids these slices".

`viewer.<Entity>.id` is the asker's id when they are a row of that Entity. For a visitor, or an asker of another Entity, entity writes `null` at `viewer.<Entity>`, so the read is null and compares as unknown, as `contextValue` in `context.ts` answers today. A page has no reading of the server's time, so it leaves `now` out, and a rule that reads it is `Unknown` there.

**The type.** An entity expression is a metakit `Expr<Env, A>` whose `Env` names what it reads, and entity's marker of which Entities it reads, `Reads`, stays beside it. So `Expr.gte(Account.fields.balance, 0)` has the type `Expr<{ row: { balance: number } }, boolean | null> & Reads<'Account'>`. `Env` is truthful, so the value can be given to any metakit function. `Reads` stays because two Entities can each have a `name: string` field, and `Query.where` must still refuse the other Entity's (`OverEntity` in `expr.ts`). A result type says `| null` when an operand may be null, which today's `Predicate` does not say.

**Deleted.** `ExprContext` as the evaluator's side channel; `Scope` and `View` in `evaluate.ts`.
**Breaks.** `Judge.predicate` and `Judge.query` return a metakit `Verdict`. A predicate that evaluates to null is `False` there, since a row is kept only on true; today the answer is the tag `Known` with the truth `'unknown'`. A caller that needs the null itself evaluates the expression.

## What are the wire names?

An expression does not travel. A page and a server each hold the declarations. What crosses is a computed assignment bound to one input: the `Computation` of `packages/entity/src/write.ts`, a tree of `Field`, `Value` and `Call` by operator name.

- metakit's ids (`num.add`) are keys of TypeScript tables and may be renamed. Wire names are frozen and versioned. `foldkit-entity` owns them in one table typed by the core ids, so a core operation with no wire name does not compile.
- The three names in use do not change: `number.add`, `number.subtract`, `text.startsWith`, each at version 1.
- New names follow the standard-library note: `number.times` for `num.mul`, `number.negate`, `text.lowerAscii`, `text.includes` for `str.contains`, `text.length`. Each is version 1 of a new name, so an older client refuses it by name (`missingName` in `expr.ts`).
- A foreign operation travels under its own id and version, as today.
- `Computation.Call` loses its `collation` field, since a fold is now a call of `text.lowerAscii`. A server refuses a `Call` that still carries a collation; it never ignores one.
- An assignment whose expression holds an `If`, a `Match`, a `Rows` or an `Opaque` node is refused where the write is declared, since `Computation` has no form for them. Nothing written today is refused by this: entity has no `If` or `Match`, and `assignmentOf` in `write.ts` already refuses a predicate, another row and the write's context.

**Deleted.** Nothing.
**Breaks.** The `collation` field of a computed assignment on the wire. The plan cuts no release while the move is in flight, so no deployed page and server meet it half-moved.

## What does `foldkit-entity`'s main entry import, and what does a page pay?

**The measurement.** A temporary page defined one Entity, built `eq(status, 'open')` and `gte(add(balance, hold), 0)`, and evaluated both over one row. It was built twice: on today's `Expr` and `truthOver`, and on three temporary constructors that build metakit nodes. Each build was measured by `measure` in `scripts/bundle-report.mjs`, the function the budget tests call through `clientBudget` (`scripts/bundle-budget.mjs`), against the packages' built `dist`. A budget test is one that fails when a page's script grows past a recorded size.

| Page | Minified | Brotli |
| --- | --- | --- |
| today's constructors and evaluator | 111,558 B | 32,639 B |
| metakit nodes, evaluated | 78,371 B | 23,669 B |
| metakit nodes, judged three-valued with `Expr.judge` | 84,004 B | 25,300 B |

Today's page carries 33,160 minified bytes of `foldkit-entity`, of which `expr.js` is 21,360 and `evaluate.js` 7,286. The second page carries 1,665 bytes of entity and 2,635 of metakit: `ops/eval` 807, `ops/num` 536, `node` 452, `ops/ord` 301, `path` 186, `ops/eq` 184, `ops/core` 141, `expr` 28. The third page carries 8,028 of metakit: it adds `ops/residualize` 3,366, `ops/kind` 768 and `verdict` 157, and more of `node` (1,527). Effect's share went from 76,640 to 72,066 bytes, since entity's evaluator uses more of Effect than metakit's does.

**What it shows.** Named imports from metakit's main entry are cut to the module. No checker, prover, SQL or conformance module reached the page, and each family of operations arrived as one small file. The byte risk the plan names does not appear for these three constructors.

**What it does not show.** The prototype has none of entity's own work: the checks made while building, custom operators, relations, ordering, `Query`. Those stay in entity and stay on a page that uses them. Today they arrive together, because `expr.ts` is one module of 124,938 characters and `Expr` is one object. Step 10 below splits it so that a page pays for what it names, and reads the plan's four page budgets again. The property table of the previous section was not in the prototype; its cost is measured in step 1.

**What entity's main entry imports**, all by name from `metakit`: the node constructors (`Node`), `Path`, the operation modules it builds calls of (`Bool`, `Eq`, `Null`, `Ord`, `Num`, `Str`), `Verdict`, and the functions over nodes. That last group is not exported today: `wrap`, `call` and `toNode` (`ops/core.ts`), `evalNode` (`ops/eval.ts`), `residualizeNode`, `judgeNode` and `readsOfNode` (`ops/residualize.ts`). The prototype had to cast for lack of them. metakit exports them from a new subpath, `metakit/build`, for a language written on the kernel.

It never imports `metakit/prove`, `metakit/sql`, `metakit/drizzle`, `metakit/conformance`, `metakit/graph`, `metakit/inspect` or the checker. `transitionOf` and `Laws.check` need `Transition` and the checker, so neither is in the main entry. `transitionOf` is exported from a new subpath `foldkit-entity/transition`, and `Laws.check` and `Laws.show` from a new subpath `foldkit-entity/laws`. `lawFactsOf` stays in the main entry; it is already a function exported by name so that a page's graph does not carry the checker (`laws.ts`).

**Deleted.** Nothing by this section.
**Breaks.** `Laws` is imported from `foldkit-entity/laws`.

## What does `Expr<Env, A>` cost the type checker?

**The measurement.** One temporary file held 165 calls of `eq`, `gte` and `add` over an Entity of twelve fields, nested up to four deep. It was checked twice, on today's constructors and on the prototype's, with `pnpm exec tsc -b examples/kitchen-sink --force --extendedDiagnostics` (`tsc` 7.0.2). The prototype's constructors returned `Expr<Env, A> & Reads<Names>`, as in the environment section. A separate file showed they are precise: a wrong literal, text given to `gte`, and a nullable sum read as a number were each refused.

| `examples/kitchen-sink` | Types | Instantiations | Check time, two runs |
| --- | --- | --- | --- |
| today's constructors, 165 calls | 147,906 | 793,225 | 1.78 s, 1.75 s |
| today's constructors, 3 calls | 147,392 | 788,921 | 1.65 s |
| metakit constructors, 165 calls | 144,663 | 776,461 | 1.61 s, 1.72 s |
| metakit constructors, 3 calls | 144,161 | 772,457 | 1.79 s |

The 162 further calls cost 4,304 instantiations today and 4,004 on metakit: about 27 and 25 a call. The check time does not separate the two; the readings overlap. The counts repeat exactly from run to run. They compare only between runs over the same set of files, because this `tsc` splits the files among several checkers.

**What it shows.** An environment written as an intersection of the fields read is no dearer than today's union of Entity names, for these constructors.

**What it does not show.** The longest expression read six fields. An expression's `Env` is an intersection with one member per field read, and nothing shortens it. The list folds' arrows and the nullable reading of `Option` were not measured. Step 10 measures `tsc -b packages/entity` against the plan's bar of 15% over its recorded time, and the examples with the largest queries.

## In what order is Phase 1 built?

The plan asks that the move go one reader at a time, with the conformance suite passing on memory, SQLite and PGlite (Postgres running inside the test process) at every step. The constructors cannot change what they build one reader at a time. So the move goes through a translation: a function from today's entity nodes to metakit nodes. Each reader is switched to read the translation while the constructors and the expression types stay as they are. When every reader has switched, the constructors build metakit nodes directly, and the old node types and the translation are deleted together.

The last column is the AI model the plan assigns to the step.

| Step | What | Model |
| --- | --- | --- |
| 1 | metakit: `metakit/build`, new operations, the property table, foreign operations, `supplied` | most capable |
| 2 | One `Verdict` for entity's judge, `Data.can` and guard's answers | Sonnet |
| 3 | metakit: `Rows` in every reader; lists, ways of writing, `emits` as a list, `commutes` | most capable |
| 4 | entity: the translation, and a differential test of both evaluators | most capable |
| 5 | entity: the judge reads the translation | Sonnet |
| 6 | entity: `transitionOf`; `Write.apply` and computations on metakit | Sonnet |
| 7 | entity: `Laws.check` on metakit's checker, then `bounds.ts` deleted | Sonnet |
| 8 | remote-drizzle: operations lowered by metakit | Sonnet |
| 9 | guard, remote, remote-domain, sync | most capable for guard |
| 10 | entity: constructors build metakit; `expr.ts` split; the old types deleted | most capable |
| 11 | The standard library and the soundness leftovers (the plan's items 8 and 9) | Sonnet, per family |

**Step 1.** In `packages/metakit/src`, it edits `node.ts` (the new ids, `ForeignOp`, the `unportable` and `unsupported` refusals; `OpLaws` removed). It edits the operation files `ops/eq.ts`, `ops/str.ts`, `ops/null.ts`, `ops/eval.ts`, `ops/residualize.ts`, and the tables in `sqlLowering.ts`, `drizzle.ts`, `abstract/ops.ts` and `prove/lower.ts`. It adds to `conformance.ts`, and adds a new `properties.ts` with `opProperties` and a generated check per declared property, a new `build.ts`, and the exports of `package.json`. The operations are `eq.equals`, `eq.among`, `str.lowerAscii`, the four text orders, `str.trim` and `null.coalesce`. In `transition.ts` and `abstract/check.ts`: the `supplied` slice, `Transition.add`, `Transition.opaque`, the nullable reading and writing of `Option` paths, and the checker's per-goal entry. It exports `PathAccessor` from the main entry. It deletes `Op.laws`. It breaks `Str.startsWith` and `Str.contains` over half a character, and the type of a path to an `Option` field. It builds on the split of metakit's two largest files (`a750f5be2`). It reads the byte cost of `opProperties` on `examples/todo-app`'s budget.

**Step 2.** `packages/entity/src/evaluate.ts` (the `Verdict` type only), `packages/remote/src/can.ts`, `canOf.ts`, `capability.ts`, `packages/guard/src/may.ts`. (`Data.can` asks whether a write would be allowed now; `foldkit-guard` states who may read or change a row.) A result held in memory becomes a metakit `Verdict`. A result that crosses the wire keeps its JSON shape (`MaySchema` in `may.ts`; `Yes`, `No` and `Undecided` in `can.ts`) and is converted where it is decoded, because a `Verdict` holds `Option` values and is not JSON. Entity gains its run-time dependency on metakit here: `packages/entity/package.json`, and a project reference in every project that loads entity from source, which the coordinating session adds. It deletes entity's `Verdict` type and `Judge.match`, and breaks code that matched the tags `Known` and `Unknown`. It can run beside steps 1 and 3.

**Step 3.** It adds `Rows` to `node.ts` and to every file that calls `Node.$match`. A new `relation.ts`, exported as `metakit/relation`, holds the `Rows` constructors over related rows and the relation type. It extends `ops/arr.ts` with the list folds and `arr.append`, `arr.include`, `arr.exclude`; `path.ts` for the `*` segment. In `transition.ts`: the list constructors, the way of writing on each write, `Transition.emit` and `emits` as a list, and `Transition.commutes`; `readsOfNode` moved to `ops/reads.ts`. In `machine.ts`: `can`, `canDispatch` and `affordances` moved to a module of their own, and the build test that a page running transitions has no `ops/residualize`. In `properties.ts`: `foldProperties` and `writeProperties`. It deletes `algebra` and `requiresRescanOnDelete`, and the machine's `canDispatch` and `affordances` members. It breaks those members (callers in `packages/agent/src/metakit.ts` and `examples/metakit/src/demo.ts`) and the shape of `Machine.update`'s emitted value. `examples/todo-app` is the first user of the list forms, and its gap list is run again here. It runs after step 1, since both edit `node.ts` and the tables.

**Step 4.** A new `packages/entity/src/lower.ts`, covering every node of `expr.ts`. A test in `packages/entity/src/conformance` runs each conformance case through today's judge and through metakit's evaluation of the translation, and requires one answer. Nothing is deleted or broken. It needs steps 1, 2 and 3.

**Step 5.** `evaluate.ts` becomes a builder of environments from held rows, and calls to metakit. What sorts rows (`compareRows`, `byCodePoint`, `ordered`) moves to a file of its own, unchanged. It deletes the half of `evaluate.ts` that evaluates values and operators, and the built-in table of `memoryTable.ts`. It breaks arithmetic past the safe range, which is now refused. A refusal stays a failure: `evaluate` throws `QueryEvaluateError` carrying the `Refusal`, and `evaluateEach` sets the row aside, as today. It needs step 4.

**Step 6.** `packages/entity/src/write.ts` and a new `writeTransition.ts`, exported as the subpath `foldkit-entity/transition`. It deletes `computed` in `write.ts`, the last caller of the evaluator's `applyOperator` besides `bounds.ts`. It breaks the wire's `collation` field and `Write.apply` over a refused value. It needs step 5.

**Step 7.** `packages/entity/src/laws.ts`, moved to `foldkit-entity/laws`. The plan's differential test runs first, over the bank fixture, `examples/writes`, `examples/chirp` and `examples/cms`. The step then deletes `bounds.ts`. It does not delete `enumerate.ts`; the next section says why. It breaks the import path of `Laws`, and a kept pair's `by: 'bounds'` becomes the tier metakit's verdict names. It needs step 6.

**Step 8.** `packages/remote-drizzle/src/compile.ts`, `operators.ts` and `checks.ts`. `compile.ts` binds the request's input into the translation with `Expr.residualize`; it already decides a predicate that reads only the input before it writes SQL (`decide`). It then lowers operations through metakit, and renders columns, hops and `Rows` itself. It deletes the built-in rows of `operators.ts` and the per-predicate cases of `compile.ts`, and breaks nothing a user wrote. It needs step 4 and edits no file of steps 5 to 7.

**Step 9.** `packages/guard/src/condition.ts`, `check.ts`, `attach.ts`; `packages/remote-domain/src/lower`; `packages/sync/src/metakit.ts`; `packages/remote/src` where it matches rows locally. The work is the plan's item 10, with its security review of guard. `guard/src/check.ts` loses its own translation and uses step 4's. It needs step 5.

**Step 10.** `packages/entity/src/expr.ts` is replaced by files under `packages/entity/src/expr/`, each under 20,000 characters: `operand.ts` (fields as paths, the origin map), `compare.ts`, `text.ts`, `logic.ts`, `operator.ts`, `relation.ts`, `order.ts`, `query.ts`, `dependencies.ts`, `show.ts`. `Expr` stays one exported object for callers, assembled from them. It deletes `lower.ts` and every old node type. This is the step where the expression types change: `_tag`, `isPredicate`, `Predicate` as a union. The four page budgets and `tsc -b packages/entity` are read here against the plan's ledger, its file of recorded measurements. It needs every step before it.

**Step 11.** As the plan lists. It edits metakit's operation files and tables, so it starts after step 3 and then runs beside steps 4 to 10.

What can run side by side: step 2 beside steps 1 and 3; step 8 beside steps 5, 6 and 7; step 11 beside everything from step 4 on. The Foldkit table that turns emitted records into Commands is the plan's Phase 3 and needs step 3 only. Steps 1, 3, 4, 5, 6, 7, 9 and 10 each wait for the steps they name.

## Where does this note overrule the plan?

| The plan says | This note decides | Why |
| --- | --- | --- |
| Evaluation of operations: metakit's survives | The mechanism survives; five of entity's meanings move in | The table of disagreements |
| Custom primitive operators become `Opaque` | They become calls of foreign operations | `Opaque` hides arguments from SQL and has no wire name |
| Collation is read as a Schema annotation | A fold operation, placed by entity's constructors | One call can override a field's collation |
| Rules on a Schema: `Entity.invariant` builds `Expr.refine` | Invariants stay on the Entity, translated per check | A rule may read the row before, or another row |
| The enumeration engine of `enumerate.ts` is deleted | It stays | It lists a write's steps for the states report |
| Six kinds of node, and no more | Seven: `Rows` | A call cannot ask a test of each element |
| Related rows need `metakit/relation` for hops | A hop is a `Path`; the subpath holds `Rows` only | Every reader already reads a nested path |
| `Data.can` and guard's answers are a `Verdict` | In memory, yes; on the wire they keep their JSON | A `Verdict` holds `Option` values |
| `Write.transition(write)`; `Write.footprint` derived from it | `transitionOf(write)` on its own subpath; footprint kept | A member of `Write` would put `Transition` on every page |
| Item 11: `Arr.*` list operations | The folds of `Rows` over a list | Their tests are nodes every reader sees |
| Item 11: `Opt.some`, `Opt.isSome`, `Opt.get` | An `Option` path reads and writes as nullable | No new operation, and the inference failure ends |
| Item 11: `Rec.get` | Not added | `MirrorRestored` also decodes through a Schema |
| Item 12: `put`, `change`, a row insert as `put` | `insert`, `patch`; a row's insert sets `present` | A row is one state; `insert` never replaces |
| Item 12: `include`, `exclude` on a set | The same, on a list of scalars kept sorted | Sorting is what lets two includes swap |
| Item 13: the tables in `laws.ts` | `properties.ts`; `Op.laws` removed | `laws.ts` is entity's checker's name |
| Item 14: a guard may not read a supplied id | Not adopted | A proof already holds for every id |

Two rows need a sentence more.

`Entity.invariant` cannot build a refinement of a Schema in general. An invariant may read the row before a write, or reach another row, and it is declared on the Entity so that every description of that Entity judges it (`invariant.ts`). `Entity.check` already gives the state invariants as a Schema filter, and that stays.

`enumerate.ts` lists concrete steps (a row before, an input, a row after) over fields with few values. `Laws.check` builds from them the arrows between an Entity's named states and the findings `Unreached`, `Terminal` and `Unmeetable`. A write's declared end state is proved from them too (`becoming` in `write.ts`). metakit's checker answers a verdict and lists no steps. So step 7 keeps the enumeration, has it judge each step through metakit's evaluator, and replaces only the interval engine in `bounds.ts`.

## What was rejected?

- **Have users write metakit expressions directly, and reduce entity to rows and relations.** Every example and guide names `Expr.eq(Post.fields.slug, …)`. The constructors also do work a raw expression cannot: they refuse another Entity's field, choose a collation and check an operator's arguments.
- **Change metakit's `eq.is` and `eq.in` to SQL's meaning.** An equality that never gives null is a real operation, which SQL has too (`is not distinct from`), and `examples/metakit/src/demo.ts` and metakit's own `Str.isEmpty` are written with it.
- **Write the null-giving equality as an `If` over `eq.is`.** It evaluates correctly. Its SQL is a `case` expression that no index serves, on the most common predicate there is.
- **A collation as an argument of each text operation.** Every reader would then branch on it in every text entry. A fold that is its own operation gives each reader one entry.
- **One `str.compare` giving -1, 0 or 1.** One operation instead of four, and SQL that hides a comparison inside a `case`.
- **The link's id as `row.author.id`,** which would need no `@` segment. A link's stored id and the id read through a hop differ when the reader may not see the row.
- **List operations as `Call`s taking a function.** A function is opaque to every reader but evaluation, which is the gap `Opaque` already has.
- **Properties on each operation's descriptor, as `Op.laws` is today.** A page would ship only the properties of the operations it names. But the properties would be members of runtime objects, and tooling would assemble the table from them; one table keyed by id is the declaration.
- **Keep both languages and translate at the edges for good.** That is today, and `guard/src/check.ts` shows what it costs: every rule it cannot translate exactly is closed to the prover.

## What is not decided, and what would decide it?

- **Whether the page budgets hold once entity's own work and the property table are counted.** The prototype covers three constructors. Step 1 reads the table's cost and step 10 the rest. If a page grows, the plan's rule 4 on bytes applies and the step stops and reports.
- **Whether metakit's checker decides every pair of write and rule that `bounds.ts` decides.** The differential test of step 7 decides it, pair by pair.
- **How the solver searches `every`, `min` and `max` over related rows.** Step 3 ships them as `Unknown` in the checker and the solver; the plan's item 8 decides the rest.
- **Whether a list fold may hold another, and whether a list in a column is lowered to SQL.** Both are refused by name in this phase. An application whose state holds a list of lists, or a stored list a query must filter, decides each.
- **Whether a primitive operator's declared properties are used by any reader.** Step 1 leaves them unused. A fixture where one would turn `Unknown` into a proof decides it.
- **The exact names of the Foldkit table that turns records into Commands, and of the runner that binds supplied inputs.** The plan's Phase 3 design note decides them, on the shape given here.

## Where to go next

- The items these steps implement, and the rules every step keeps: [metakit-unification-PLAN.md](./metakit-unification-PLAN.md), Phase 1.
- Why each disagreement between readers has the rule it has: [601-expression-standard-library-DESIGN.md](./601-expression-standard-library-DESIGN.md), section 3.2.
- What the solver proves and how it replays a counterexample: [600-solver-pass-DESIGN.md](./600-solver-pass-DESIGN.md).
