# Refreshing what a page reads (#261)

Status: built (2026-10-27) in `foldkit-remote`: `Data.refresh` takes the
active record or one entry of it, `{ failed: true }` narrows it to what
failed, and a retried read reads `Loading`, not `Initial`.

## The problem

A failed read is not retried on its own, by design, so a page needs a "Try
again". `Data.refresh(model, target)` took a Projection or a Surface without
params. Most pages are Surfaces with params (a profile by handle, a thread by
id), placed by `Surface.at` from the route, so a Try again had to rebuild
each projection with its params by hand. That restates `actives`, the record
that already says which Surfaces a page reads and with which params. Add a
Surface to a page, and its Try again silently misses it.

Two smaller faults rode along:

- A refresh of a whole page refetches what loaded, and replaces a list's
  pages with one page: a Try again for one failed avatar collapsed a list
  scrolled five pages down.
- Refreshing a read that failed with nothing to show cleared its failure, and
  until the read entry's `ReadStarted` or `QueryStarted` landed, the read
  said `Initial`. The Try again button blinked away, and `Initial` claims
  nothing is fetching.

## Decision

```text
Data.refresh(model, target, { failed? })
target = Projection | Surface without params | ActiveEntry | Record<string, ActiveEntry>
         └──── each entry resolved for this Model as the read entries resolve it ────┘
```

1. **The target is what the wiring already takes.** A record is the one
   `Data.wiring`, `subscriptions`, `satisfy` and `preload` take; an entry is
   one value of it (`Surface.at`, `Surface.when`, `Surface.each`,
   `Data.active`). Each is resolved with `resolvedOf`, the function the read,
   live and retain entries use, so params come from the one place they are
   declared and a family reaches its parent and every instance. An inactive
   entry asks for nothing. Entries of another application are refused, as
   everywhere else.
2. **`{ failed: true }` is "Try again".** It keeps only the entity reads whose
   own or related fields failed (`failureOf`, the walk the reads use to show
   `Failed`) and the lists whose query failed. A list that loaded is not
   invalidated, so its later pages stay. Nothing failed: the same Model.
3. **A retried read keeps its place.** The reducer, not the refresh, turns a
   failure mark into a loading mark when it asks again: `RefreshStarted` for
   each field mark it settles, `ConnectionInvalidated` for a list's. The
   read then says `Loading` until its read lands, and `Failed` again if that
   fails. The loading mark replaces the failure mark, and retention prunes
   both by the same roots, so it lives no longer than the failure did. A
   refresh of something that never failed marks nothing loading: with nothing
   observing it, `Initial` stays the truth.

## Options considered

- **A second verb, `Data.retry(model, target)`, for reads.** Rejected: it is
  `refresh` with a filter, and #260 needs `retry` for writes, whose meaning
  (send the same request again) differs from asking a read again.
- **Marking loading in `Remote.refresh` itself.** Rejected: the reducer is
  where failure marks are settled, and a Message-only path (a Port, a
  recording, a policy's own `RefreshStarted`) would otherwise still blink.
- **Deriving "owed" from the refresh generations** (`requested` above
  `started`). Equivalent on screen, but connections keep no `started`
  generation, and it would be a second record of what the loading set says.
- **Loading marks only where the store holds no value.** A held value is
  shown whatever the mark says, and the read's answer clears the mark, so the
  check was redundant; a mutation that removed it survived.

## Tests

`packages/remote/test/refreshActive.test.ts`, with
`refreshActive.mutations.ts` (10 mutations, all killed): params from the
Model, one entry, a family, a record whose keys are named like an entry's
members, an inactive record, a foreign Surface, `failed` for a read and for a
list, and a `Trace` of Failed, Loading, Failed, Loading, Ready with no
`Initial` between. `readme.test-d.ts` and two `@ts-expect-error` cases check
the types: a Surface with params, placed nowhere, is refused.

## Deferred

Nothing from the issue. The broader #234 work (stale-while-revalidate for
connections, a `Read` product shape) is tracked there.
