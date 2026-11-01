# fate's cache, against Remote, and what we change

Status: plan (2026-11-01). The source is fate's own documentation, read
from its repository at af7e5ae (2026-10-29): the Requests, Actions, List
Views, Live Views, Deferred Views and Persistence guides, and the 1.0
announcement. A companion to
[solid-2-forms-cache-COMPARISON.md](./solid-2-forms-cache-COMPARISON.md).

## How fate does it

fate is a Relay-inspired data client for React and Vue. Each component
declares the data it reads in a co-located view (a GraphQL fragment), and the
views compose into one request at the screen's root. Objects are normalized,
and each view sees only the fields it selected.

- **Read modes.** `cache-first` (the default) fetches only what is missing.
  `stale-while-revalidate` shows the cache and refetches on every mount.
  `network-only` always fetches. `cache-only` observes the cache, never
  fetches, stays subscribed, and reads `missing` when the data is absent.
  Nothing ages in memory: `maxAge` exists only for saved data.
- **Keeping data.** A mounted request retains its data. After unmount the 10
  most recently released requests are kept (`gcReleaseBufferSize`), so going
  back under `cache-first` sends nothing. `fate.retain(request)` keeps data
  outside a component.
- **Lists.** Each logical view keeps its own loaded window, restored after a
  remount. A refresh smaller than what another reader loaded does not cut it.
  A partial refresh updates its own page and keeps the continuation pages.
  Only a complete answer removes rows.
- **Writes.** The caller says what an answer refreshes (`view` on the
  action), which lists a new object joins (`insert: { into, position }`;
  since 1.0 the default is no insert, and automatic list matching is
  deprecated), and what it predicts (`optimistic`, with temporary ids swapped
  on answer). `delete: true` removes the object from every list and restores
  it on failure.
- **Live.** The server says what changed: `live.update('Post', id, { changed:
  ['likes'] })`, `live.connection(...).prependNode(...)` or `.invalidate()`.
  The default event bus does not replay events missed while disconnected.
- **Saved reads.** Per request: `persist: { maxAge }`, one day by default,
  within a 25 MiB budget evicting the least recently used saved request.
  Saved data is loaded when a request needs it, not restored whole at
  startup.
- **Offline writes.** Saved before the optimistic update or the send, sent in
  order one at a time per key, with tabs coordinating delivery. Retries carry
  the same identity, and the server keeps a receipt in the write's
  transaction. A temporary failure retries. **An authentication failure waits
  for the user to sign in again.** A terminal client error rolls back. A new
  write that cannot fit in storage fails before it is shown or sent.

## Against Remote

| | fate | Remote |
| --- | --- | --- |
| Store | Normalized objects | Normalized rows and lists |
| Read modes | `cache-first`, `stale-while-revalidate`, `network-only`, `cache-only` | `cacheFirst`, `staleWhileRevalidate({ maxAge })`, `networkOnly`; no cache-only |
| Freshness in memory | None | By age: a read waits until the earliest held value passes `maxAge` |
| Going back | The last 10 released requests reuse their data and send nothing | A left list is held stale under `cacheFirst`, so it reads `Refreshing` and refetches; only `staleWhileRevalidate` within `maxAge` sends nothing |
| Memory bound | 10 released requests | 1,000 rows and lists, the screen left longest ago first |
| What a write refreshes | Named by the caller | Derived: the answer carries what visible Surfaces show of the rows it names, and the first page of each list whose rows it moved (#386) |
| A new row into a list | Named by the caller | Placed by the list's query body, checked by `Law.check` and `verifyPredictions` |
| Live | The server names what changed | The server re-reads through `readAs` and runs each list's window again, resuming from a cursor |
| Saved reads | Per request, with its own `maxAge`, least recently used evicted, loaded lazily | One snapshot of the whole cache within `maxBytes`, restored through `flags` before `init` |
| Offline writes | As above | The outbox: the same order, identity, ledger and tab rules |
| A write the session no longer covers | Waits for sign-in | `Forbidden` settles it as `Failed` |

## What we keep, and why

- **Derived refresh and placement.** fate asks the caller to name lists
  because its client has no query semantics: it cannot know whether a new
  comment belongs in "recent comments". Our lists carry their filter and
  order, so placement is exact and checked. fate's move from automatic to
  explicit insertion is the outcome our bodies exist to avoid.
- **Derived live changes.** A server that names its own changes misses the
  one it forgets; re-reading through `readAs` cannot leak a withheld member
  (#264).
- **A refresh asks one page the size of the widest window.** That already
  keeps another reader's loaded range, and it lets rows the server removed or
  reordered leave. fate's kept continuation pages can disagree with the page
  in front of them; a "Try again" (`{ failed: true }`) already keeps later
  pages where only part failed.
- **A budget by entries, not requests.** It bounds memory where a request
  count does not.
- **Restoring saved reads whole, before `init`.** It is what makes a reload
  draw the stored list in its first frame (#262). fate's lazy loading suits
  Suspense; a Foldkit view reads the Model synchronously, so a lazy load
  would bring back the `Loading` frame. The budget keeps the restore small.

## The plan

Four changes, in this order. Each is its own issue.

1. **Back and Forward from held lists** (#401). A history navigation reads a
   recently left list `Ready` and sends nothing; a navigation the reader
   starts still refreshes it.
   - Remote learns the navigation's kind from a Message (`Navigated({ kind:
     'history' | 'push' })`), as it learns the time. `Site.routing` sends it
     from `popstate` against a link or a Command.
   - Under `cacheFirst`, a list left is held with the time it was left. A
     history navigation back within `historyWindow` (a `Remote.make` option,
     default 5 minutes, Solid's figure) reads it `Ready`; past the window, or
     after a pushed navigation, it is stale as today.
   - `why` names the reason a list was not asked (`HeldForHistory`).
   - The test: Back within the window makes no request and draws no
     `Refreshing` frame; Back past it, and a link to the same page, refetch.
2. **A `cacheOnly` policy** (#402). `RemotePolicy.cacheOnly` plans no reads,
   shows what the store holds, and keeps following store changes (answers,
   live patches, writes). A value it lacks reads `Initial`, and `why` says it
   was not asked because of the policy. A screen that works offline picks the
   policy from the Model (an `online` field the app keeps), so switching it
   restarts the read entry, as a policy change does today. The plan must show
   that switching to `networkOnly` on reconnect asks what `cacheOnly` left
   missing, and that `cacheOnly` keeps a read-only page free of write code.
3. **An outbox write waits for sign-in** (#403). A send the server answers
   as unauthenticated (no principal, as opposed to a principal it refuses)
   keeps the write queued as `WaitingForSignIn` rather than settling it
   `Failed`, holds the writes after it in order, and sends again when the app
   reports a sign-in (`Data.signedIn`, from `update`). `Forbidden` stays
   final. A change of principal still means another key, so one person's
   writes are never sent as another's. The server side must tell the two
   apart on the wire: check what `RemoteServer` answers for a visitor today.
4. **Saved reads with their own age and an eviction order** (#404).
   `persistence(Data, …)` takes `maxAge` (default one day), and a
   `Data.subscriptions` call can pass `persist: { maxAge }` or `persist:
   false` for what it reads. A snapshot keeps what is younger than its
   `maxAge`, evicting the least recently read first when it passes
   `maxBytes`. Rows another kept list still names stay. The restore stays
   whole and synchronous through `flags`.

Not taken: lazy loading of saved reads, caller-named list insertion and
refresh, server-named live changes, continuation pages kept across a refresh,
a request-count retention bound, and refusing a durable write the store
cannot save (sending it now still delivers what the reader asked for; the
outbox reports `OutboxUnsaved`).
