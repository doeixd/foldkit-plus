# API Cache

A list of posts, a page per post, and a stats panel, fetched from a slow and
occasionally failing fake server. It shows query caching, stale-while-revalidate,
request deduplication and interval refetching. It ports Foldkit's
[`api-cache`](https://github.com/foldkit/foldkit/tree/main/examples/api-cache)
example to Foldkit Plus.

Upstream writes the query client by hand: an `AsyncData` field per query, a
fetch Command per endpoint, and a ticking Subscription. Here the server's data
belongs to [`foldkit-remote`](../../packages/remote): one `remote` Submodel in
the Model holds every post and the stats once, field by field, and the app
only says what each screen reads.

```text
Data.active(read)  ->  plan what the Model lacks  ->  RemoteClient  ->  Remote Message  ->  update  ->  Model
```

A read is active while its tab is open. Reading a projection performs no I/O;
the Subscription entries `Data.subscriptions` derives do the fetching, and
`update` only reduces what comes back (`GotRemoteMessage`) or marks something
due again (`Data.refresh`).

## Run it

```bash
pnpm --filter foldkit-example-foldkit-api-cache dev
npx vitest run examples/foldkit-api-cache   # from the repository root
```

## Who owns what

| Concern | Owner |
| --- | --- |
| Posts, post pages and stats, cached in the Model | `foldkit-remote`: `Remote.Model`, `Data.query` (the list), `Data.get` (a page, the stats) |
| What a post and the stats are | `foldkit-entity`: `Entity.define`, and `Entity.select` for what each screen reads |
| A revisit served from the Model | Remote's planner: a read asks only for fields the Model lacks, so opening a post reads just `author` and `body` (the list brought the title), and a second visit reads nothing |
| Invalidate, Refresh, Retry | `Data.refresh` in `update`: the old value stays on screen as `Refreshing` and the active read fetches again |
| Deduplication | Remote: a refresh of what is already refreshing returns the same Model, a read in flight leaves its entry's plan unchanged so it is not sent again, and the client joins an identical request in flight |
| Refetching the stats every 5 seconds | `RemotePolicy.staleWhileRevalidate({ maxAge: 5000 })`: the stats read sleeps until the reading is 5 seconds old, then fetches it again, only while the Stats tab is open |
| Forgetting what no tab reads | Remote's `retain` entry, with a five-minute `grace` |
| Loading, refreshing, stale and failed states | `RemoteData.render`, whose `Stale` freshness keeps the last good value under the error |
| The fake server: 700 ms latency, a post whose page fails every other read, random stats | `foldkit-remote-server`: `RemoteServer.make` with an entity Source per entity and a query Source, served in process by `Remote.clientLayer` |
| Look | `foldkit-mixins`: Slots and Styles in `src/style.ts`, a `Theme.oklch` palette, `Layout` pieces, and the `foldkit-mixins-ui` Button and Tabs recipes over `@foldkit/ui` |
| Tabs, the open post | plain Foldkit: `@foldkit/ui` Tabs as a Submodel, and `maybeSelectedPostId` in the Model |

## Differences from upstream

- **The list takes one round trip.** A query answers with the posts' ids and
  the fields each row shows, which one `ConnectionMerged` merges and writes
  together. Opening a post then reads just `author` and `body` (the list
  brought the title), and a second visit reads nothing.
- **Returning to the Stats tab after 5 seconds refetches at once**, the old
  numbers on screen. Upstream shows the cached numbers and resumes its ticker.
  Here the timer is the data's age, not the tab's.
- **"Updated at" is the time the server sampled the stats**, a field of the
  reading; `Data.meta(model, projection)` also reports when what is shown was
  last received (`updatedAt`, with `stale` and `loading` beside it).
- **An unknown post is `NotFound`**, not a failure: the server answered with
  nothing about it.
- **What no open tab reads is collected after five minutes.** The stats have a
  `Data.subscriptions` call of their own, for their policy; retention is the
  domain's, so the second call's `retain` is left out and the one kept roots
  what either reads. Upstream keeps everything it fetched for the session.
