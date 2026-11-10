# #481: async values at a boundary, what TypeScript already proves

Status: decided (2026-11-10). No new API. The existing folds already refuse
what #481 asks to refuse; this note records the evidence, the preferred form
for composing a Remote read, and what stays outside any type proof. It slices
the #481 row of [#480's audit](./480-async-guarantees-DESIGN.md).

Evidence lives in two test files, both in `packages/remote/test`:

- `asyncBoundaries.test-d.ts`: type cases. Every `@ts-expect-error` carries
  exactly one defect; removing all of them at once gave one error on each
  following line (20 directives; probed 2026-11-10), so none is
  vacuous.
- `asyncComposition.test.ts`: a Remote read through a Surface and two
  `RemoteData.map` calls in a `pipe`, over a real store driven by Remote's own
  Messages. `asyncComposition.mutations.ts` breaks `RemoteData.map` four ways;
  all four are killed.

## The three values are not one value

| | `RemoteData<A>` (Remote) | `AsyncData<A, E>` (Foldkit) | `AsyncResult<A, E>` (Effect) |
| --- | --- | --- | --- |
| Owner | Remote's store; derived per read, never written by the app | the application's Model, written in `update` | an Effect atom / reactivity runtime |
| Not asked yet | `Initial` (no active Surface plans it) | `Idle` | `Initial` |
| First load | `Loading` | `Loading` | `Initial` with `waiting` |
| Refresh over a value | `Refreshing` | `Refreshing` | `Success` with `waiting` |
| Failure over a value | `Failed` with `previous` | `Stale` | `Failure` with `previousSuccess` |
| Failure, nothing held | `Failed` | `Failure` | `Failure` |
| The row does not exist | `NotFound` | none | none |
| Error type | `RemoteError`, open `_tag` by design | typed `E` | `Cause<E>`: typed failure, defect, interruption |
| Interruption | the read entry restarts; `ReadAbandoned` returns the field to `Initial` | none: a Command reports what it reports | `Interrupt` in the `Cause` |
| Defect | not a state; see [non-guarantees](#outside-the-proof) | none | `Defect` in the `Cause` |

Converting between them loses information (`AsyncData` has no `NotFound`,
neither Foldkit nor Remote carries a `Cause`), so no adapter is offered: each
value is folded with its own `match`.

## Matrix

| # | Point | Today's evidence | Decision |
| --- | --- | --- | --- |
| 1 | `RemoteData.match` refuses a missing case | `asyncBoundaries.test-d.ts:25` (`NotFound`), `:34` (`Ready`); `core.test-d.ts:107` (`Failed`). TS2741 names the case | already guaranteed |
| 1 | `RemoteData.match` refuses an extra case | `:50`, TS2353 | already guaranteed |
| 1 | `RemoteData.render` refuses a missing `notFound` / `failed` | `:88`, `:95` | already guaranteed |
| 1 | `Freshness.match` refuses a missing `Stale`, so a stale value cannot be drawn as fresh | `:108` | already guaranteed |
| 1 | `AsyncData.match` refuses a missing or extra case | `:230` (`onStale`), `:246` | already guaranteed (Foldkit) |
| 1 | `AsyncResult.builder(...).exhaustive()` exists only once every case is handled | `:288` (interrupt owed), `:296` (defect owed), `:302` (`Initial` owed); complete forms compile at `:269`–`:281` | already guaranteed (Effect) |
| 3 | No value before `Ready` | `.value` on the union is TS2339 (`:119`); `AsyncData`'s `.data` the same (`:260`); a narrowed `Ready` / `Refreshing` reads it (`:125`–`:130`); a misspelt tag is TS2367 (`:131`) | already guaranteed |
| 3 | A failed read's held value may be absent | `match` hands it as `Option<A>` (`:60`); the raw field is `A \| undefined` (`:122`) | already guaranteed |
| 3 | Uncaught failure | `failed` / `Failed` are required (`:88`, `:95`); the error reaches the view through the pipe (`asyncComposition.test.ts`, "the first read failed") | already guaranteed |
| 3 | Unknown requirement: an Entity, query or mutation the domain does not register | `fromEntity.test-d.ts:90`, `dx.test-d.ts:178`, `:217`, with branded messages naming it | already guaranteed |
| 3 | Cross-owner read: another application's Model | refused in a `Projection.struct` (`:193`) and a Surface (`:197`) when the Models differ | guaranteed for differing Models; see below |
| 2 | A read keeps state and error through a Surface and a `pipe` | types: the Surface keeps the whole union (`:165`), two `map`s give `RemoteData<number>` (`:172`). Runtime: `asyncComposition.test.ts` "keeps the state when …", eight states | already guaranteed; the preferred form is documented |
| 2 | The read is still fetched after composition | `asyncComposition.test.ts` "carries the read's requirement": `requirementsOf` and `Data.plan` through the Surface | already guaranteed |
| 4 | Stale-while-refreshing, stale-on-failure | `render`'s `data` branch with `Freshness` (`remoteData.test.ts`, `freshnessUnion.mutations.ts`); through the pipe, `asyncComposition.test.ts` "draws …" | already guaranteed |
| 5 | Initial load, refresh, failed refetch, interruption | `asyncComposition.test.ts`; `domain.test.ts` `Data.refresh` (`:1037`, `:1126`) | demonstrated |
| 5 | Defect | Effect's builder: `onDefect`. Remote: not a state | non-guarantee, below |
| 6 | Nothing duplicated | no adapter, wrapper or second fold added | — |
| 7 | Diagnostics name the missing case | TS2741 names it for all three `match` folds and `render`. Effect's builder reports TS2339 on `exhaustive`; the owed case shows only in the type's arguments (`Builder<…, Interrupt>`) | Remote and Foldkit: yes. Effect's: upstream, not ours |

### The preferred form

`View.matchRemote`, the issue's sketch, would forward to `RemoteData.render`
and add nothing. A Surface holds the read whole (it carries the requirement),
and the view transforms the value:

```ts
pipe(
  read.project,
  card => RemoteData.map(card, ({ name }) => name),
  name => RemoteData.map(name, text => text.length),
)
```

`RemoteData.map` is data-first, so a curried call in `pipe` is refused
(`:177`). A data-last overload would be convenience, not a guarantee, and was
not added. `RemoteData.match`'s arms share one result type inferred from the
first (`:68`); pin `R` to mix them (`:75`). Foldkit's `AsyncData.match` unions
its arms instead (`:251`).

No combinator joins two `RemoteData` values. Which of `NotFound`, `Failed` and
`Loading` wins for a pair is a view decision, and nested folds keep each one
exhaustive. Add one when an application asks, with that precedence stated.

## Outside the proof

- **A ternary over `_tag` and a cast compile** (`:137`, `:138`). `pnpm
  tags:check` refuses the ternary in `packages/*/src` and `examples/*/src`,
  not in tests; nothing refuses a cast.
- **Roots are compared structurally.** A read of an application whose Model
  this one's contains (both have `remote: Remote.Model`) joins a struct
  (`:201`–`:208`). It reads the same path, so it is not wrong at run time,
  but the type does not say which application it was written for.
- **Two bindings over one Model** make reads of one type (`:222`). Which
  binding planned a read is in its metadata, not its type.
- **A client defect leaves a read `Loading`.** The read entry turns a failed
  `RemoteClient.read` into `ReadFailed` with `Effect.result`, which does not
  catch a defect. Probed 2026-11-10 with a client whose `read` is
  `Effect.die`: the stream ends after `ReadStarted`, the field reads
  `Loading`, and the next plan asks for the same requirements, so nothing
  restarts it. `RemoteData` has no defect state, and this is Remote's runtime
  (`domain.ts`'s `readMessage`), not a type matter. Reported to the
  coordinator to file.
