# Expr: pipeable authoring, type contracts, interpreters and inferred reads (#478, #479, #483, #185, #64)

Status: Proposed 2026-11-10: awaiting the owner's decisions. A design note;
nothing here is built. It slices
[480-async-guarantees-DESIGN.md](./480-async-guarantees-DESIGN.md), whose
findings it starts from and does not repeat. Source was read at `91ed361`;
every type claim marked *probed* was compiled in `packages/entity` with
`npx tsc -b packages/entity` (TypeScript 7.0.2) in a scratch `*.test-d.ts`
that was then deleted. #481's type cases
(`packages/remote/test/asyncBoundaries.test-d.ts`, `0cdaee6`) and #482's
temporal laws are another note's; they are referenced here, not redone.

## 1. The problem

The five issues are about one thing seen from five sides: `foldkit-entity`'s
expression kernel, which is one tree of immutable nodes that several
interpreters read.

```text
            authoring (#478)            contracts (#479)
  builders --------------> Expr / Predicate nodes ---> what tsc knows of them
                                   |
              dependenciesOf: fields, next, inputs, operations,
              operators, reaches            (#483 asks: Model paths too?)
                                   |
        interpreters (#185): memory, held (client), SQL, Guard
                                   |
        requirements on a Projection (#64): Remote's metadata keys
```

| Issue | Asks | Short answer of this note |
| --- | --- | --- |
| #478 | Data-last, pipeable authoring and symbolic functions over the existing kernel | Worth a small addition: a single-signature data-last form per builder and operator, used with Effect's own `pipe` and `flow`. No `Fn`, no `.pipe` method, no `Num` namespace yet |
| #479 | Types that carry reads, effects, failures, capabilities and law evidence | One contract is worth strengthening (`Reads`, which has a hole, §2.2). The others are already held by disjoint types, by startup checks, or by tested laws, and should stay there |
| #483 | Symbolic Projections whose reads are inferred | Decided against by #480 with a measurement; this note adds only what `Expr` cannot do there and one small remaining item |
| #185 | Open operations, separate interpreters, Layers, laws | Built in phases 0 to 7. Four departures from the issue are open for acceptance; this note recommends accepting all four and closing |
| #64 | Tag requirements once a second interpreter exists | The tagging exists in another shape (`Metadata.key`). No second requirement interpreter exists. One loose end: SSR matches keys by name |

They relate in one direction: #478 changes only how a tree is written, so it
must not change what #479's types say of it, what the interpreters of #185
run, or what `dependenciesOf` reports. The probes in §4 are mostly checks of
that sentence.

## 2. Today

### 2.1 Construction and composition

- **Nodes are frozen object literals.** `node` is `Object.freeze`
  (`packages/entity/src/expr.ts:446`). A scalar is one of nine variants
  (`Expr<T>`, `:178`), a predicate one of ten (`Predicate`, `:200`); a
  predicate is its own type, not `Expr<boolean>`, so the two cannot be
  confused (`:192`). `Operandish` is either (`:331`).
- **Builders are data-first functions on one object.** `Expr.eq(left, right)`
  types its right side from its left (`:1781`); comparisons take an optional
  third `{ collation }` (`:746`); `Expr.and`, `or`, `not`, `isNull`,
  `contains`, `in`, `path`, `exists`, `whenGiven` (`:1936`).
- **A user-defined symbolic function exists**: `Expr.operator(id, { input,
  output, definedAs })` (`:1599`). `definedAs` is called with the call's real
  arguments each time, so every construction check runs on the body, and a
  body that reads a field or input no argument holds is refused when called
  (`readKeys`, `:1002`). Without `definedAs` the operator is primitive and
  each interpreter implements it. The kernel ships one primitive,
  `Text.startsWith` (`packages/entity/src/text.ts:31`); `foldkit-cms` defines
  `cms.published` (`packages/cms/src/index.ts:323`). No numeric scalar
  operator exists anywhere in `packages/*/src`.
- **An operator is an overloaded callable**: one signature for its arguments,
  one with a trailing `CallOptions` (`Operator`, `:854`).
- **`Query` is `Pipeable`** (`:2491`, `pipeArguments` at `:2673`), with
  data-last `Query.where` and `Query.orderBy` (`:2729`). Nodes are not: no
  `pipe` method. `Post.fields.title` is an `EntityField`, a different object
  with the same three members a `FieldExpr` has (`:434`), and has no `pipe`
  either.
- **Effect's `dual` is used in four files** (`packages/bundle/src/link.ts`,
  `combinators.ts`, `packages/guard/src/server.ts`,
  `packages/mixins-ui/src/menuUtils.ts`); none in `foldkit-entity`.

### 2.2 What is inferred

| Fact | Where | How it holds |
| --- | --- | --- |
| Value type of an operand | `ValueOf` (`:395`), `ArgumentOf` (`:829`), `TextOperand` (`:426`), `OrderedOperand` (`:613`) | tsc; constraints on the type parameter, not intersected checks, for the reason the `TextOperand` comment gives |
| Which Entities a node reads, by name | `Reads<Names>` (`:348`), `ReadsOf` (`:357`), consumed by `OverEntity` (`:376`) in `Query.where` / `orderBy`, and by the bodies of `Write.when` (`write.ts:264`) and invariants (`invariant.ts:149`) | tsc, with a run-time check behind it (`checkOwnership`, `:2587`, by identity) |
| Fields, `next` fields, inputs, operations, operators, reaches | `dependenciesOf` (`:2455`), `Query.dependencies` | run time, from the tree; a call is walked through its expansion |
| What an interpreter cannot run | `Expr.unsupported` (`:1664`), `Query.unsupported` (`:2844`) | run time, at startup or definition |
| Size | `maxQueryNodes` (`:2617`) | run time, at `Query.where` |

Two holes, both *probed*:

1. **`ReadsOf` of an unmarked node is `never`, and its doc comment says
   `string`.** The comment at `:351` to `:355` says a node with no marker
   "reads as `string`, unknown". `ReadsOf<Predicate>`, `ReadsOf<Expr<string>>`,
   `ReadsOf<FieldExpr<string>>` and `ReadsOf<EqPredicate>` are all `never`:
   the last conditional (`X extends { readonly '~reads'?: infer Names }`,
   `:364`) does not match a type that lacks the property, and falls to
   `never`. Only `EqPredicate & Reads<string>` gives `string`. Nothing is
   refused wrongly today, because `OverEntity` accepts both `never` and
   `string` and the run-time check decides: a predicate over `Author`
   widened to `Predicate`, or returned from a helper annotated `: Predicate`,
   compiles into a `Post` query and is refused when the query is defined.
   But `never` is the type's word for "proved to read no Entity" (a literal,
   an input), so "unknown" and "nothing" are one type. Anything built later
   that trusts `never` (an elimination, a memo key, #479's "typed `never`
   means proved-empty") would be unsound. Inside `definedAs`, parameters are
   unmarked, so the body's reads are `never` there too.
2. **`Reads` names Entities by name** (#480, "What each issue should do",
   #479): a namesake passes tsc and is refused at run time. Unchanged here.

### 2.3 How interpreters consume it

| Interpreter | Entry | What it does with a node it cannot run |
| --- | --- | --- |
| Memory, two-valued over rows | `evaluate` (`packages/entity/src/evaluate.ts:1138`), `supported` (`:1099`), a `MemoryOperators` table passed as a value (`operators.ts:221`) | `assertSupported` throws by name (`:1118`) |
| Held, three-valued over what a client holds | `Judge` (`evaluate.ts:825`), `Held` (`held.ts:252`); Remote's matching (`packages/remote/src/matching.ts:227`), placement (`placement.ts:54`), impact (`impact.ts:103`) | `Undecided`, and the server decides |
| SQL | `compileWhere`, `compileCall`, `compileOrderBy` (`packages/remote-drizzle/src/compile.ts:1024`, `:1048`, `:1063`), a `DrizzleOperators` table (`operators.ts:111`) | the server refuses to start |
| Guard | `GuardServer.validate` (`packages/guard/src/server.ts:1177`), which reads `predicate`, `order` and `reaches` (`:1249`) | refuses at startup |
| Law between two interpreters | `Law.check` (`packages/remote/src/law.ts:90`): the client's prediction against the server's answer | throws when it compared nothing (`:76`) |
| Laws of one operator | `Conformance.laws` / `lawsBy` (`packages/entity/src/conformance/operator.ts:436`); evidence is stamped by the runner (`tested.ts`) | a hand-built `Tested` record is refused (`remote-drizzle/src/operators.ts:195`) |

One law already changes behaviour: a ledgered increment skips its `expect`
only when commutativity and associativity are `Tested`, with no narrowed
domain, for both implementations (`commutes`,
`packages/remote-drizzle/src/index.ts:1413`). That is #479's "evidence-gated
rewrite; a claim alone must not enable it", already built and mutation-tested.

Every walker is an exhaustive match (`Match.tagsExhaustive` or a `switch`
ending in `absurd`), so a new node variant is a compile error in each
interpreter. That is the strongest contract the kernel has, and it is why
this note adds no node.

### 2.4 Where requirements are tagged

Surface defines no requirement shape. A `Projection` carries
`dependencies` (Model paths) and an opaque `metadata`
(`packages/surface/src/index.ts:357`); an interpreter owns a typed key
(`Metadata.key`, `packages/metadata/src/index.ts:68`), found by the key
object, never its name. Remote owns two: `RemoteRequirements` and
`RemoteConnections` (`packages/remote/src/requirement.ts:141`, `:147`),
attached where a read handle is made (`domain.ts:985`, `live.ts:72`).

Readers of Projection metadata today: Remote's own planner and resume
capture (`resume.ts:92`), and two generic ones that summarize without
interpreting (`packages/agent/src/forApplication.ts:140`,
`packages/ssr/src/index.ts:433`). SSR's coverage check asks each resume part
which keys it `covers` and reports the rest as `unresumed`
(`ssr/src/index.ts:455`, `:524`); `covers` is a list of key **names**
(`ssr/src/shared.ts:285`, `remote/src/resume.ts:288`), the one place a key is
matched by string.

No package other than Remote attaches a requirement to a Projection. The
keys in `foldkit-composition`, `foldkit-crud`, `foldkit-form`,
`foldkit-guard`, `foldkit-cms` and `foldkit-entity` annotate Blocks, fields
and Entities, not Projections' data needs.

### 2.5 What is lost through Projection composition

Nothing a Surface reads. `Projection.of`, `struct`, `array`, `option` and a
ref's `select` union `dependencies` and combine `metadata`
(`surface/src/index.ts:490` to `:607`); #481's
`asyncComposition.test.ts` runs a Remote read through a Surface and two
`RemoteData.map` calls and keeps state, error and held value.

Three places hold less, each known and safe:

- `Projection.derive` returns a `Derived` with `dependencies` and no
  `metadata` (`:451`). It is a view-side memo, not a Surface's read (#480).
  When something in `on` reads what no path names, it recomputes on every
  read (`readsUnnamed`, `:437`).
- `Projection.fromReader` defaults both to empty (`:617`), which `derive`
  then treats as unnamed.
- `derive`'s `on` is a promise; `verify` checks it in development (`:657`).

## 3. Options

### 3.1 #478: the authoring surface

Effect's convention is `dual`: one name, data-first with every argument,
data-last with all but the first, told apart by arity or a predicate.

| Option | What it is | Verdict |
| --- | --- | --- |
| A. Nothing; `pipe(x, t => Expr.eq(t, v))` | Works today (*probed*: reads stay exact) | The baseline. Fine for one step; a lambda per step for a chain |
| B. `dual` by arity on the fixed-arity builders (`eq`, `lt`…`gte`, `contains`, `in`) | `Expr.eq(value)` returns a step | Works (*probed*, §4). The data-last form takes no `{ collation }`: `Expr.lt(value, { collation })` and `Expr.lt(left, right)` are both two arguments |
| C. `dual` by arity on `Operator` | `Text.startsWith(prefix)` returns a step; a unary operator is a step as it is | **Rejected** (*probed*): an overloaded callable passed point-free loses its reads to `string`, and `flow` takes its last overload (§4, hazard 1) |
| D. One single-signature member per operator | `Text.startsWith.step(prefix)`, `lower.step()` | Works (*probed*): reads exact through `pipe` and `flow`, errors at the step |
| E. `.pipe` on every node | `Expr.field(f).pipe(…)` | Type cost nil (*probed*); but `Post.fields.title` would still have none, so half the chains start with a wrapper. Not needed: Effect's free `pipe` takes both |
| F. `Fn.define(schema, flow(…))` | A second symbolic function | **Rejected**: `Expr.operator` with `definedAs` is that, with an id, a version, hygiene and `Query.show` already. `definedAs: title => pipe(title, trim.step(), lower.step())` is the issue's `normalize` |
| G. `Num`, more `Text` | `Num.subtract`, `Text.trim`, `lowercase`, `replaceAll` | **Not now**: data-query §6.0's rule stands (an operator states its semantics, names a caller, is built in the reference interpreter first). None of these has a caller, and each is a primitive needing a memory and two SQL implementations with agreed null, collation and Unicode behaviour |

The recommended surface is B plus D, used with `pipe` and `flow` from
`effect`:

```ts
// sketch: `.step` and one-argument `Expr.eq` do not exist yet
import { flow, pipe } from 'effect'

const byPrefix = pipe(Product.fields.upc, Text.startsWith.step(input.search))
const isDraft = pipe(Post.fields.status, Expr.eq('draft'))

const slug = Expr.operator('blog.slug', {
  input: [Schema.String],
  output: Schema.String,
  definedAs: flow(trim.step(), lower.step()),
})
```

Each step builds exactly the node the data-first call builds: `op.step(...rest)`
is `self => op(self, ...rest)`, and one-argument `Expr.eq(v)` is
`left => Expr.eq(left, v)`. No new node, no new walker case, nothing for an
interpreter to learn. `Predicate` stays its own type (constraint 5 of #478):
a boolean operator's step returns a `TestPredicate`, and `Expr.not`,
`isNull` and `isNotNull`, already unary with one signature, are steps today.

### 3.2 #479: which contracts belong in types

The test for a type contract: a mistake a reader of real feature code can
make, refused where it is written, with a message that names it, and a
negative case that goes red when the constraint is widened. By that test:

| Contract (from #479's table) | Today | Decision |
| --- | --- | --- |
| Correct values in pure composition | tsc (§2.2) | Keep. Extend to the data-last forms, with their negatives |
| Explicit reads, unknown distinct from none | tsc, with the hole in §2.2 | **Fix**: an unmarked node reads `string`. The one change to types this note recommends on its own merits |
| Reads tell namesakes apart | run time (identity) | Keep at run time (#480): no consumer, and a unique symbol per `Entity.define` would reach every `Reads` in every signature |
| No write or I/O inside an expression | construction: `Write` and `Expr` are disjoint; an operator's implementation is a synchronous function of stored values (`operators.ts:22`), supplied to an interpreter, never held by a node | Keep. No effect row: there is no effectful term to carry one |
| Symbolic Fn keeps captures explicit | run time, at each call (`readKeys`) | Keep. tsc cannot see what a closure captured |
| Interpreter supports every operator used | startup (`unsupported`, `GuardServer.validate`) | Keep at startup (§3.3) |
| Rewrites only under evidence | run time: stamped evidence, `commutes` | Keep. An evidence type would be forgeable by a cast; the WeakSet stamp is not |
| Exhaustive async outcomes | tsc (#481) | #481's |
| Temporal laws | runtime laws (#482) | #482's |
| Declared transition writes only its own target | tsc: `Write.update(E, …)` types its fields by `E`; Guard at run time | Keep |

Of #479's suggested queries, `ValueOf` and `ReadsOf` exist and are
exported. `RequirementsOf`, `ErrorsOf`, `WritesOf`, `OwnerOf` and
`AssuranceOf` have no consumer and are not proposed.

### 3.3 #185: is the open-operations design finished

The issue's acceptance list is met except where the build departed on
purpose (the owner's status comments of 2026-10-28 and 2026-10-29). The four
departures, and whether anything since argues against them:

| Departure | Since then | Recommendation |
| --- | --- | --- |
| Tables are plain values, not Effect services and Layers | Every caller is synchronous: client matching, invariants, Schema checks, placement. A Layer would add a service lookup to hand over a value built once | Accept |
| Completeness at startup, not in types | To carry operator ids in types, `Operator` needs a `const Id`, every node a second phantom beside `Reads`, and `Query<E>`, `Write`, guards and invariants a parameter to keep it, since `Query.where` returns `Query<E>` (`:2729`) and drops what its predicates carried. The startup check already fails before a request is served, and covers widened and dynamic bodies, which types cannot | Accept |
| No partial or effectful operators | No caller | Accept |
| An increment on a real column keeps `expect` | Follows from floating-point addition not associating | Accept |

**Smallest open-operations design**: what is built. An application declares
an operator, implements it per interpreter in a table, and a server that
lacks one does not start. Nothing to add.

### 3.4 #64: is it time to tag requirements

The issue's condition is a second interpreter of a Projection's
requirements: a Sync `select` that declares a document it needs, or a
Resource Projection. Neither exists. What changed since the issue was
written is that the tagged union it proposed (`Requirement.make('remote' |
'replica' | 'resource', …)`) is no longer the natural shape: requirements
are already keyed per interpreter by `Metadata.key`, open to any package,
merged by each key's own `merge`, and invisible to Surface. A closed tag
list in Surface would be a second way to say what a key already says, and
Surface would have to name its interpreters.

So the answer to "is it time" is: the tagging is done, by another route, and
the pure `Prepare.plan(surface)` the issue wanted is each interpreter's own
function over its own key (`requirementsOf`, `connectionsOf`,
`requirement.ts:153`).

One loose end. `ResumePart.covers` names keys by string, so two keys named
alike would be read as one covered. Remote's are `'remote'` and
`'remote.connection'`; every other key in the tree is prefixed by its
package. Options: leave it (names are for tooling, and the check is a
coverage report, not a security boundary); or have `covers` hold the key
objects, which `foldkit-ssr` can compare without importing Remote.

### 3.5 #483: what is left

#480 measured the three `Projection.derive` calls in the tree and found a
checked `Projection.fromExpr` would cover none of the risky ones, then built
`verify`. This note adds why `Expr` in particular does not fit, since the
issue's sketch reuses it:

- An `Expr` reads a **row**: its leaves are an Entity's fields, an input, the
  viewer, the time. A Projection reads a **Model**, through `ModelRef`s. An
  `Expr.ref(App.model.inventory.quantity)` would be a tenth scalar variant,
  which every interpreter's exhaustive match must then answer, and every one
  but a new Model evaluator would answer "refused". That is a second
  language sharing a type, which #480 rejected.
- The kernel computes almost nothing: one primitive operator. A derived
  Model value is arithmetic, filtering and formatting, which is ordinary
  JavaScript in `derive`.

What does remain, small and optional: a `Derived` cannot be an entry of
`Projection.struct`, since it has no `Model` schema or `metadata`. Whether
that matters depends on a caller wanting a memoized value inside a Surface's
Projection; none does today.

## 4. TypeScript cost

**Budget.** #190 names a type budget but has not set one: it is question Q8
of `contract-layer-PLAN.md` (`:450`), to be measured in its Phase 0, and
invariant 12 (`:137`) says a check that breaks it moves to a run-time
validation and a test. Until a number exists, this note measures against the
package itself. Baseline, `npx tsc -b packages/entity --force
--extendedDiagnostics`, sources and tests: 694,493 instantiations, 165,564
types, check time between 1.1 s and 2.2 s over four runs (so time is noise at
this size, and instantiations are the measure).

**Probes**, each compiled alone, results as tsc printed them:

| # | Probe | Result |
| --- | --- | --- |
| 1 | `ReadsOf` of `Predicate`, `Expr<string>`, `FieldExpr<string>`, `EqPredicate`; of `EqPredicate & Reads<string>` | `never` four times; `string` once (§2.2) |
| 2 | A predicate over `Author` annotated `: Predicate`, into `Query.from(Post).pipe(Query.where(…))` | Compiles. Run time refuses it |
| 3 | `pipe(Post.fields.title, t => Text.startsWith(t, 'a'))` | Reads `'Post'` |
| 4 | Single-signature steps, hand-typed: `pipe(title, trimL, lowerL)`; `flow(trimL, lowerL)` then applied; a step given `Author.fields.name` | Reads `'Post'`; `'Post'`; `'Author' \| 'Post'`. `flow`'s own type holds a deferred `ReadsOf<S>` that resolves when applied |
| 5 | The cross-Entity predicate from 4 into a `Post` query | Refused at `Query.where`, with the `Invalid` sentence "a predicate reads Author, but the query is from Post" |
| 6 | Data-last `Expr.eq(right)`, checked by a conditional intersected onto the later `left` parameter | Accepts a literal, an input, a predicate against a boolean field, `'open'` against a literal union. Refuses `42` and an `InputExpr<number>` against text, `'yes'` against a boolean, `'closed'` against the union. Each refusal lands on the step; the `Invalid` sentence is the third line of the message |
| 7 | `typeof Expr.eq & typeof eqL` (the dual), called with two arguments, one wrong | Same message as today: "Argument of type 'number' is not assignable to parameter of type 'string \| PathExpr<…> \| Expr<string>'" |
| 8 | `Operator` given a third, data-last overload; a unary operator passed point-free; `flow(lower, concat('-'))` | Reads widen to `string` for the whole chain, so the cross-Entity refusal of probe 5 no longer fires in types. `flow` takes the last overload (the `CallOptions` one) and fails to compile. Reordering the overloads compiles and still gives `string` |
| 9 | `Operator`'s two data-first signatures merged into one over `A \| [...A, CallOptions]` | Worse: reads are `string` even data-first, and a wrong argument reports a tuple mismatch |
| 10 | A `step` member derived from `Operator<In, Out>`: `(...rest: Tail) => (self) => …` | Reads exact through `pipe` and `flow`. A wrong value: "Argument of type '3' is not assignable to parameter of type 'ArgumentOf<NullOr<String>>'", at the value. A wrong subject: at the step. Arity: TS2554 |
| 11 | `Pipeable` merged onto all nineteen node interfaces by module augmentation | 694,122 instantiations (no measurable change). Nineteen errors, all in the kernel's own constructors (`expr.ts`, `context.ts`); no test and no other package builds a node from a literal |
| 12 | 200 three-step chains, piped through steps, against the same 200 nested data-first | +23,715 against +13,289 instantiations: about 119 a chain piped, 66 nested |
| 13 | `pipe(Post.fields.title, Expr.isNull, Expr.not)`, as they are today | Reads `'Post'`: a builder with one signature is already a step |

**Hazards**, by their name in `CLAUDE.md`'s list:

1. *An overloaded callable in `pipe` or `flow`.* Probes 8 and 9. This is why
   option C is rejected and a step is a member with one signature. The
   failure is the quiet kind: it compiles, and reads become unknown, so the
   check falls to run time and no test of accepted programs notices.
2. *A type check intersected onto a parameter can fail open.* Probe 6 uses
   that idiom and holds, because the conditional compares `R`, already fixed
   by the outer call, against `ValueOf<L>` of an `L` inferred from the
   argument itself; it is `Query.where`'s shape. It must ship with its four
   negatives, each alone, and a mutation that widens the conditional.
3. *An unused `@ts-expect-error` is how a fails-open check announces itself.*
   Fixing `ReadsOf` (§5, phase 1) changes `never` to `string` under existing
   positive tests; no directive should become unused, and one that does is a
   finding.
4. *`infer` on an optional property.* `Reads`' `'~reads'?` is optional and
   never set, which is the cause of §2.2's hole. The fix is in the
   conditional's last branch, not in making the property required: a required
   phantom would make every plain `Predicate` unassignable where a marked one
   is expected (`write.ts:264`).
5. *A function-typed property makes a generic invariant.* `step` is a member
   of `Operator<In, Out>`, which is already invariant in `In` through its
   call signatures; `OperatorDescriptor`, what nodes and tables hold, is
   untyped and unchanged.

**DX at the call site.** A step reads left to right and needs no
`Expr.field` wrapper. Its cost is one concept ("a step is the call without
its subject") and messages one level deeper than data-first: a wrong subject
is reported as the step not fitting the pipe, with the reason below it.
Data-first stays, and stays the form the README teaches first.

## 5. Recommendation and plan

Recommendation: fix the one contract that is wrong (`ReadsOf`), add the
smallest data-last form that keeps it exact (`step`, and one-argument
`eq`-family builders), and close #185, #64 and #483 on what is already
built. No new node, namespace, effect row, Layer or symbolic-function type.

Each phase ships alone.

**Phase 1: `ReadsOf` says unknown for an unmarked node.** (#479)

- Change: the last branch of `ReadsOf` (`expr.ts:364`) answers `string`
  where a type has no `'~reads'`; fix the doc comment or the code so they
  agree. No public name changes; `ReadsOf` is exported, so run the Jev
  review.
- Type tests (`expr.test-d.ts`): `ReadsOf<Predicate>`, `<Expr<string>>`,
  `<FieldExpr<string>>` equal `string`; `ReadsOf<LiteralExpr<1>>`,
  `<InputExpr<string>>` and a plain value equal `never`; a marked node keeps
  its names; a widened predicate still compiles into another Entity's query
  (probe 2), with the run-time refusal asserted beside it in `expr.test.ts`.
- Mutation: restore `never` in the last branch; the three `string` cases go
  red.
- Risk to check first: any signature that reads `[Names] extends [Name]`
  with `Names = string` and refuses. `OverEntity` tests `string extends
  Names` first and accepts; grep for other consumers before the change.

**Phase 2: steps.** (#478)

- `Operator` gains `step`, one signature, derived as in probe 10; at run
  time `(...rest) => self => op(self, ...rest)`, so every check an operator
  call runs still runs. It takes no `CallOptions`.
- `Expr.eq`, `lt`, `lte`, `gt`, `gte`, `contains` and `in` accept one
  argument and return a step (`dual` by arity). The one-argument
  comparisons take no `{ collation }`.
- Type tests, negatives each alone: probes 4, 5, 6, 7 and 10 as written
  above; `flow` of two steps applied to a field; a step into `Query.where`,
  a Guard row rule and an invariant.
- Runtime law, one table-driven test: for each builder and for
  `Text.startsWith`, the piped node `Equal`s the data-first node
  structurally (`toEqual`), has the same `dependenciesOf`, the same
  `Expr.show`, and the same answer from `evaluate` and from SQL through the
  existing conformance cases. An operator defined with `flow` of steps in
  `definedAs` expands to the body written nested.
- Mutations: a step that drops `self`; one that swaps `self` and `rest[0]`;
  one-argument `eq` returning `Expr.eq(v, left)`; `step` bypassing the
  operator (building the node itself, so skipping argument checks).
- Docs in the same change: README (data-first first, steps after), the
  skill's entity reference, CHANGELOG. A README snippet is compiled.
- Budget: the entity project's instantiations stay within 2% of 694,493
  after the new tests are counted separately (probe 12 puts 200 chains at
  3.4%, so the allowance is for the declarations, not the tests).

**Phase 3: close out.** No code unless a decision below asks for it.

- #185: record the four departures as accepted.
- #64: close, pointing at `Metadata.key`; optionally `covers` by key object
  (decision 6).
- #483: close on #480's `verify`.
- #478 and #479: close on phases 1 and 2.

Not planned: `.pipe` on nodes (decision 3), numeric or further text
operators (decision 4).

## 6. Decisions for the owner

1. **Fix `ReadsOf` so an unmarked node reads `string`?** Options: (a) fix
   the type, as phase 1; (b) fix only the comment and leave `never`; (c)
   leave both. Recommendation: (a). It is the only place this audit found a
   type saying something the code does not keep, and every later use of
   `Reads` inherits it.
2. **The data-last form for operators.** Options: (a) a `step` member with
   one signature; (b) `dual` by arity on the operator itself; (c) a free
   `Expr.step(op, ...rest)`; (d) none, lambdas only. Recommendation: (a).
   (b) loses reads to unknown and breaks `flow` (probe 8). (c) is the same
   types with a longer call. The name is open: `step` is not Effect's
   word, and nothing in Effect names this, because Effect's own functions
   are not overloaded on a trailing options argument.
3. **`.pipe` on nodes?** Options: (a) no, use `pipe` from `effect`; (b)
   yes, on nodes and on `EntityField`. Recommendation: (a). (b) costs
   nothing in types but changes every node from a frozen literal to an
   object with a prototype, for a spelling.
4. **Ship `Num` and more `Text` operators with this?** Options: (a) no, each
   waits for a caller under data-query §6.0; (b) ship the issue's sketch
   (`Num.subtract`, `Num.gte`, `Text.trim`, `lowercase`, `replaceAll`).
   Recommendation: (a). `Num.gte` is `Expr.gte` already. The inventory
   example's `quantity - reserved >= amount` is the first real caller for
   subtraction if the owner wants one; it would be its own change, with
   Postgres's parameter casts (expr-operations §17).
5. **Accept #185's four departures and close it?** Options: (a) accept all;
   (b) reopen type-level completeness; (c) reopen Layers. Recommendation:
   (a), for the reasons in §3.3.
6. **#64: close, and should `covers` hold key objects?** Options: (a) close
   and leave `covers` as names; (b) close and change `covers` to keys, a
   breaking change to `ResumePart`; (c) keep #64 open until a second
   requirement interpreter exists. Recommendation: (a). The names are
   package-prefixed by convention and the check is a report.
7. **#483: close on `verify`?** Options: (a) close; (b) let a `Derived` be a
   `struct` entry; (c) build `Projection.fromExpr`. Recommendation: (a);
   (b) when a caller asks; (c) not at all (§3.5).
8. **Tell namesake Entities apart in `Reads`?** Options: (a) no, run time
   decides (#480's position); (b) a unique symbol per definition.
   Recommendation: (a).

## 7. Risks, review points, rejected alternatives

**Risks.**

- Phase 1 turns "proved none" into "unknown" for types that were already
  unknown. If some signature treats `string` as a refusal, valid programs
  stop compiling; the grep in phase 1 is the guard, and the full
  `typecheck:force` the proof.
- A step's error is harder to read than a data-first one (probe 6). If
  users reach for steps first, the kernel's best messages are seen less.
  The README order (data-first first) is the mitigation.
- `dual` by arity on `eq` makes a one-argument call valid where it was a
  type error ("Expected 2 arguments"). A forgotten second argument now
  returns a function, and the error moves to where it is used.
- Two ways to write one node. They build the same value, which the phase 2
  law holds; it is still two spellings to teach. This is the cost of #478
  at all, and the reason the surface is this small.

**Review points.**

- Probe 8 is the load-bearing one: re-run it before accepting option (a) of
  decision 2 over (b), on the TypeScript version current at the time.
- Check phase 2's `step` against `Expr.operator`'s `definedAs` branch: a
  defined operator takes no collation, and a step takes none either, so the
  two agree; a primitive operator with `collation: 'required'` and no
  collated operand is refused by the call a step makes, at the step.
- `Expr.in` and `contains` have a right side that is not typed from the
  left the way `eq`'s is; write their data-last signatures from their own
  constraints, not by copying probe 6.

**Rejected alternatives.**

- **A second expression language or state model.** #480 rejected
  ReactiveScript's holds, lanes and probes, a `Question` type, a fourth
  async result and a checked `Projection.fromExpr`. Nothing here revives
  them: no node, no evaluator and no Model-level `Expr` is added.
- **`Predicate` as `Expr<boolean>`.** The kernel's comment at `:192` gives
  the reason: a structural phantom would let a predicate and a text scalar
  be confused. Steps do not need it.
- **A semantic mega-type** (`Expr<T, Reads, Needs, Effects, Errors>`).
  #479 itself rules it out. Three of the four extra rows would be `never`
  in every program that can be written today.
- **Operator ids in types** for compile-time completeness (§3.3).
- **Effect services per operator, or an interpreter Layer** (#185's sketch):
  evaluation is synchronous on every caller's path.
- **A tagged requirement union in Surface** (#64's original shape): a
  second, closed way to say what a `Metadata.key` says.
- **Merging `Operator`'s signatures to make it `dual`-friendly** (probe 9).
