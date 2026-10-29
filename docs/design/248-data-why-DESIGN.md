# Why a read shows what it shows (#248)

Status: built (2026-10-29). `Data.why` returns typed reasons; `Data.timeline`
folds recorded history into each read's changes of tag. See
[Deferred](#deferred).

## The problem

A read returns `Loading` from any of four branches: its list is missing, its
list is stale with no pages, a row cannot be assembled, or a field of a row is
in flight. A list reads `Refreshing` because the list is stale, a row is
stale, or a row is left out until a field arrives. The view sees one tag.
Finding Chirp's one-frame blip (#243) took a cast of `model.remote` to `any`
and a dump of `loading`, whose answer was two `entity\0id\0field` marks: a
pending write's answer had sent two fields of one row to be read again.

`Data.why` already existed, and answered one question well: for `Initial`,
whether no active Surface reads the read (`NotObserved`) or one does and
Remote's Subscriptions are missing (`NotFetching`). For every other tag it
said one sentence about the tag, not about the read.

## Decision

```text
Data.why(model, read, { surfaces? })  → ReadWhy { state, because: Why[], message, surfaces }
Data.timeline(start, history, reads, { surfaces? }) → ReadStep[] { read, index, message, from, to, why, regression }
```

### 1. `because` is every fact the Model holds about the read

`because` lists what the Model says about each thing the read reads, by typed
reference (a row is `{ entity, id }`, a list `{ query, identity }`, a field
its key), never by mark. It is not one reason per tag: a list can be
`Refreshing` because its own page is stale *and* one row's field is in
flight, and saying only one hides the other. `message` is the words for the
reason that decides the tag (the first that applies to it), so a log line
still reads as one sentence.

| `Why` | When | What restarts it |
| --- | --- | --- |
| `NotObserved` | `Initial`, and no active Surface asks for all of the read | activating a Surface that does |
| `NotFetching { surfaces }` | `Initial`, and an active Surface does | installing `Data.subscriptions` and a `RemoteClient` |
| `NoActiveRecord` | `Initial`, and no `surfaces` given to tell | — |
| `List { list, held, inFlight }` | the list's own query is `Missing` or `Stale`; `inFlight` while its request is out | the read entry, while a Surface reads it |
| `Fields { row, via, fields, held, inFlight }` | fields of one row are `Missing` or `Stale`; `via` is the relation path from the read's row (`['author']`) | the read entry |
| `ListFailed { list, error }`, `FieldsFailed { row, via, fields, error }` | a request failed and nothing has settled it | **nothing on its own**: `Data.refresh`, a write of the field, or a new page |
| `Unavailable { row, via, fields }` | the server will not send these fields to this principal | selecting without them |
| `Undecodable { message }`, `OverlayOnly { message }` | the `Failed` states the store's values cause | a fix in the Selection or the overlay |
| `Deleted { row, by }` | the row is gone: the server said so (`by` none) or a pending write deletes it | — |
| `LiveReconnecting { surface, attempt, error }` | a live stream of a Surface reading it broke | the live entry, on its own, with backoff |
| `LiveRefused { surface, error }` | the server refused the stream | nothing until what it asks changes |
| `Pending { row, fields, by }` | a pending layer writes fields the read shows | its answer, or its failure |
| `Joined { list, row, by, terms }` | the list shows a row the server's pages do not hold | the answer |
| `Left { list, row, by, terms }` | the server's pages hold a row the list does not show | the answer |

`by` is a `Source`: `Write { requestId, mutation }` (`Data.mutate`; the
mutation is none for a write started without one), `Overlay { id }`
(`Data.overlay`) or `Live { cursor }` (a live event's insert or remove).

**What restarts it** is in the words, and in the tag: the table's third
column is what `message` says. "It retries" is a claim about what restarts
it (AGENTS.md), and a failed read is restarted by nothing, so `FieldsFailed`
says so rather than carrying a `retrying` flag that would always be false.
A write waiting in the outbox for the network is a write's state, not a
read's: `Data.outboxStatus` says it, and the read shows the write as `Pending`.

### 2. `terms`: which part of the body put a row in or out

For `Joined` and `Left` over a query with a body, each top-level `where`
predicate is judged over the visible store, as the client placed the row,
with the viewer the newest pending operation was predicted for:

```ts
{ term: 'author = $authorId', truth: 'True' }            // put it in
{ term: 'status = $status', truth: 'False' }              // took it out
{ term: 'team.name = $name', truth: 'Unknown', reason: 'Team.name is not held' }
```

`truth` is `True`, `False`, `Null` (SQL's unknown: the row is out) or
`Unknown` (the store lacks what it rests on; `reason` says what). It is
`Judge.predicate`, the interpreter the law checks against SQL, so a term
reads here as it reads on the server. A body with no `where` (an order
alone) has no terms, and a list ordered by the server alone (`Query.make`)
has none either.

Predicates are judged one by one, not as one conjunction: the conjunction is
what placed the row, and a reader asking "why is it in this list" wants the
term, not the verdict.

### 3. One schema, so devtools can carry it

`ReadWhy` and `Why` are Schemas (`defineTaggedUnion`), so code matches
`Why.match` exhaustively, and `Schema.encodeSync(ReadWhy)(why)` is plain JSON
(an `Option` is `null` there) for a log, a test snapshot or a devtools
client.

### 4. The timeline is a fold over history, not a devtools panel

The issue asked for a panel in Foldkit's devtools. Foldkit 0.169 gives no
place for one: `DevTools` takes one overlay factory (`DevToolsOverlay`, set
by its Vite plugin through `__setDevToolsOverlay`, which is internal), and
the store it is handed is not given to the application. A second overlay
would replace Foldkit's, not add a tab.

What Foldkit's devtools does hold is the history: each Message and the Model
after it (`DevToolsStore.getMessageAtIndex`, `getModelAtIndex`, and the same
over its MCP server). That is all a read timeline needs, so the timeline is a
pure function over it:

```ts
Data.timeline(start, history, { feed, post }, { surfaces })
// [{ read: 'feed', index: 3, message: MutationSucceeded, from: 'Ready', to: 'Loading',
//    why: { state: 'Loading', because: [Fields { row: Post:abc, fields: ['editedAt'], ... }] },
//    regression: true }]
```

One entry per change of a read's tag, with the Message that changed it and
`why` at the Model it left. `regression` is #234's rule, which
`Trace.regressions` checked by itself until now: a read that showed a value
stopped showing it with no reason a reader can see (`Loading`, `Initial`, or
`Failed` without the value). `Trace.regressions` is now `Data.timeline`
filtered by it, so there is one rule.

### 5. Recording causes in the Model: not done

The issue proposed that development builds record what caused each plan and
invalidation in the Model. The timeline makes that unnecessary for the
question asked: the Message between two Models *is* the cause, and the
timeline names it. A record in the Model would grow every snapshot devtools
keeps (each entry stores a whole Model) and would be one more thing a replay
must reproduce. `Fields.held` says whether a field is missing (an answer or
retention dropped it) or stale (invalidated, or refreshed), which is what the
record would have added.

## Ownership

`Data.why` and `Data.timeline` own nothing. They read the Model, as `read`
does, and every fact in `because` is one the read itself consults. They do
no I/O and plan nothing; `Data.plan` is what the read entry will fetch.

## Deferred

- **A panel in Foldkit's devtools**, until Foldkit offers a way to add one
  (an overlay that composes, or a panel slot). The timeline's output is what
  such a panel would draw.
- **Causes recorded in the Model** (§5), should a question appear that the
  Message cannot answer.
- **`Left` for rows past the window**: a row a pending write moves past the
  read's window is neither shown nor in the read's part of the pages, so it
  is not named.

## Tests

`packages/remote/test/why.test.ts` (each `Why` from a Model built by the
Messages that make it, the decisive reason for each tag, the JSON encoding),
`timeline.test.ts` (steps, the regression rule), `why.test-d.ts` (the
types), `why.mutations.ts`; `examples/chirp/test/why.test.ts` over Chirp's
own post and timeline.
