# Audit: per-reader permission data sent to the client (#284)

Status: done (2026-10-29). The guarantees are written for users in
[foldkit-guard's README](../../packages/guard/README.md) ("What `may` tells a
reader, and what it does not") and the skill's `references/guard.md`.

## Threat model

```text
may is a UI hint; enforcement is server-only.
server: every write checked by the rules when it is made, from the request's principal
client: may (served, or foreseen for its own rows) greys out buttons, and refuses
        locally a write it says no to; a yes it holds decides nothing
```

What the client may hold is the reader's own booleans over rows it can see,
an `explain` sentence it is refused with, and `Me` (`signedIn`, `key`, `may`).
The policy's shape (which interactions, members and relations have rules) is
in the shared declaration, which the browser bundle carries already; principal
guards' bodies stay on the server.

Chirp here is `examples/chirp`. It serves four writes (`PostChirp`,
`EditPost`, `LikePost`, `Unlike`); the issue's `DeletePost`, `FollowAccount`,
`Account` and `AUTHOR_MAY` belong to another copy of the app. Its foreseen
`may` is phase 5's prediction, not a constant.

## Checklist

| Item | Outcome | Evidence |
| --- | --- | --- |
| Server enforcement does not depend on `may` | Holds. Every served Chirp write, sent as another person, a visitor, or with a forged `may` (and `author`/`user`) in its input, is `Forbidden` and changes nothing; a test fails when the server serves a write the table does not try. A cached `may` saying yes still sends the edit, which the server refuses; the page shows `Failed { Forbidden }` and takes the edit back. | `server.test.ts` "a write no button would send" (f6036511); `stale.test.ts` "an edit a held may allows…" (9883aecc). Mutations `chirp.mutations.ts` "… past its guards": Edit and Unlike killed; Post survives, declared: `Entity.sets` stamps the author and `RemoteServer.write` refuses a visitor before any rule, so the Create rule is redundant there. |
| `unguarded: 'allow'` | Fixed. `unguarded` has no default (it is required, so the choice is written down); a default of either value would hide it again. Instead `GuardServer.validate` refuses a declared write whose interaction (`Create`/`Update`/`Delete`) has no rule under `'allow'`; `[Guards.anyone]` says anyone may on purpose. Chirp's sets are covered (every write has a rule; its open Reads are deliberate). | `write.test.ts` "refuses a write with no rule, which unguarded: 'allow' lets anyone make…" (05f2c8a6); `write.mutations.ts`, four killed. |
| No leaks through `reasons` | Holds, documented. `reasons` carries only an `explain`'s sentence for an interaction refused to this reader; the sentence is a constant of the shared declaration. No type or lint guard: a literal-string type would reject nothing a reviewer cares about (wording), so the rule is in the README. | `mayAudit.test.ts` "gives a reason only as the shared declaration words it…" (36462d17); mutation "a reason is worded on the server" killed. |
| No existence oracle | Holds. A hidden row's read (with `may`, with a field, by id alone) is byte-for-byte the answer for an id that does not exist. A write to a hidden row answers as to a missing one: an update `Forbidden`, a delete answered gone (probed over `write.test.ts`'s fixture). There is no `withReread`; a write's read-back goes through the same Sources. A create of a taken id is refused alike whatever the row holds (`write.test.ts` "answers every create of a taken id alike"), which does say the id is taken: ids the client mints are random. | `mayAudit.test.ts` "answers a row its reader cannot see as it answers one that does not exist"; mutation (rule off the Source) killed. |
| `members` / `relations` reveal policy shape | Acceptable; no opt-out. `may` names the same keys for every reader and row: the declaration's, which ships in the bundle. Leaving a member out would hide nothing the bundle does not show. | `mayAudit.test.ts` "names the same interactions, members and relations for every reader and row"; mutation "may names only what its reader may do" killed. |
| Caching across principals: Remote endpoint | Fixed (published in 0.35.0). `serveFetch` sent no `cache-control` (a live stream `no-cache`); every response now says `no-store` unless the application's `headers` set one. POST answers are rarely stored by caches, so the exposure needed a cache configured to keep them. | `fetch.test.ts` "lets no cache keep …" (1901ce5b); `fetch.mutations.ts`, two killed. |
| Caching: live hub | Fixed (the check shipped in 0.35.0). `validate` let a Source declare `may` `shared` on an Entity anyone may read, which the hub would send as one reader's answer to all. Refused now. The hub groups re-reads by principal (`key`, by default the principal itself). | `mayAudit.test.ts` "GuardServer.validate over a Source sharing may" (36462d17); mutation killed. |
| Caching: SSR HTML and hydration state | Holds. The page, with its hydration state, is rendered per request; the examples that render a reader's rows send `private, no-store` and `vary: cookie` through `SSR.entry`'s `headers`. | `examples/auth/test/page.test.ts`, `examples/reference/test/worker.test.ts`, `examples/foldkit/ssr/test/server.test.ts`; and the `auth.mutations.ts` mutation making it public. |
| Caching: client cache on sign-out/sign-in in one tab | Holds. `Remote.forget` on any change of principal; `foldkit-auth`'s `believing` fetch refuses an answer for another subject. | `examples/auth/test/app.test.ts` "a change of principal". |
| Caching: durable outbox | Fixed (unreleased). The page held its queue by store `key` alone, so with a key shared by principals a moved `scope` sent the last principal's waiting writes as the new one, and after `Data.forget` the new principal's empty queue was written over them. The queue is held for `key` and `scope`; a record holding another scope's waiting writes is never written over (`OutboxUnsaved`). With one key per principal (Chirp: `chirp-outbox:<me>`, and a switch of person reloads the page) neither happened. | `outbox.test.ts` "a change of principal in the same page" (d0bdc024); `outbox.mutations.ts`, three killed. |
| Stale `may` after a role change | Holds. Read as an admin, `may` says yes; the next request, no longer an admin, is refused and writes nothing. In Chirp a held yes sends the write and shows the server's refusal. Nothing reads `may` as truth: the server never reads it from a request. | `mayAudit.test.ts` "may after its reader's role changed" (da64f9cd); `stale.test.ts`. |
| Optimistic `may` | Holds. The foreseen value shows until the answer; the request carries the Mutation's input (`{ id, body }`) and field names only, no `may` value; the answer's read-back `may` replaces it. `Law.check` agrees the foreseen value with the server's. | `stale.test.ts` "the may a page foresees…" (9883aecc); `law.test.ts` (`Post:p9.may`). |
| `Me.key` | Holds, documented. It is `Guards.declare`'s `key` of the principal (Chirp: the user id), shown to that principal; `Me` is read per request, its Source shares nothing, and goes out under `no-store`. Apps must not make `key` a token. | `me.test.ts` "answers … as themselves"; README `Me` section. |

## Not done

- A `validate` check that `Me`'s Source declares nothing `shared`: it would
  have to be spread onto `GuardServer.me`'s Source by hand.
- Sync's journal exchange and media uploads answer outside `serveFetch`; their
  cache headers were not part of this audit.
