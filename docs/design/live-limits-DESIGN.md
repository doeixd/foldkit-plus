# One admission for every live subscription

Status: built (2026-10-28) in `foldkit-remote` (`RemoteLiveRefused`, the
client's `Refused` live status and `LiveRefused` diagnostic) and
`foldkit-remote-server` (`handlers`' `FoldkitRemoteLive`, `serveFetch`'s
error frame). Follows "Not done" in `264-guarded-poll-live-DESIGN.md`.

## The problem

A live subscription is cheap to send and expensive to serve: `pollLive`
re-reads every subscribed row each tick (every 250 milliseconds by default,
or each tick the row log names a row), for as long as the stream stays open.
The read handlers refuse a batch naming more than `maxIdsPerEntity` ids of
one Entity, and the `liveHub` refused such a subscription itself, but
`handlers` passed a live Source's requirements on unchecked. A client could
subscribe `pollLive` to any number of ids, and each tick read them all.

The hub's check lived in the hub, so the two live paths had already drifted:
every limit added to one had to be remembered in the other, and in each
hand-written live Source.

## Decision

```text
FoldkitRemoteLive(requirements)
  -> admit(requirements, maxIdsPerEntity)   refused: RemoteLiveRefused, no Source asked
  -> every live Source and the hub subscribe with what was admitted
```

1. **The handler admits a live subscription once, before any live Source
   or the hub sees it.** It is the read path's check: at most
   `maxIdsPerEntity` distinct ids of one Entity (default 1000, `handlers`'
   option, which `serveFetch` passes on) and at most four pages of one
   relation. The hub no longer checks, and its `subscribe` no longer takes
   `maxIdsPerEntity`. A Source's `subscribe` can rely on what it is given
   having passed.
2. **Over the limit is refused, not truncated.** Watching the first thousand
   rows and silently missing the rest would show stale rows as live. The
   stream fails with `RemoteLiveRefused` (a wire error of its own, over RPC
   and as `serveFetch`'s `event: error` frame with `refused: true`), and
   nothing is read.
3. **The client does not reconnect a refused stream.** A refusal is decided
   by the requirements, so asking again is refused again; reconnecting with
   backoff would hide it behind `Reconnecting`. The stream's health records
   the refusal, `Data.liveStatus` reads `Refused` with its error, and a
   `LiveRefused` diagnostic is recorded (and reported, as every Remote
   diagnostic is). The live entry subscribes again only when its
   requirements change, which is a new stream.

Fields per requirement need no limit here: the wire decoder refuses more than
`MAX_FIELDS_PER_REQUEST` (256), live or read, and a read through
`RemoteServer.readAs` asks only for declared fields. Watched lists are the
application's (`pollLive`'s `lists`), each watched through an id that counts
toward the cap.

## Options considered

- **Check in `pollLive` and keep the hub's check.** Rejected: two copies of
  one rule, and every hand-written live Source a third.
- **Truncate to the limit.** Rejected as a quiet fallback: rows past the cap
  would read as live and never change.
- **A separate, lower live cap.** Not now: one number for reads and live
  keeps a page that reads N rows able to watch them. An application wanting
  less passes a smaller `maxIdsPerEntity`.

## What is tested

- `packages/remote-server/test/liveLimits.test.ts`: over the cap (ids, or
  pages of a relation) is refused with `RemoteLiveRefused` for a
  `RemoteServer.live` Source and for the hub alike, before either is asked;
  at the cap both subscribe; the refusal reaches a fetch client as
  `RemoteLiveRefused` through `serveFetch`.
- `packages/remote-drizzle/test/pollLimits.test.ts`: `pollLive` under the
  handler is refused before a row is read, and at the cap never reads more
  ids a tick than it.
- `packages/remote/test/liveRecovery.test.ts`: a refused stream reads
  `Refused`, records one `LiveRefused` diagnostic, and does not restart; a
  refusal after a break ends the reconnecting; a stream opened again and
  admitted reads `Live`.
- Mutations: `remote-server/test/liveLimits.mutations.ts` and the refusal
  cases in `remote/test/liveRecovery.mutations.ts`.

## Not done

- One client can open several streams, each under the cap. Bounding
  streams per caller is a deployment's rate limit, not this protocol's.
- `pollLive` reads once a tick for each distinct set of fields its rows
  ask, so its reads a tick are bounded by the id cap, not by one.
