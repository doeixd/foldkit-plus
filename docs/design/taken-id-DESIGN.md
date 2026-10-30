# A create of a taken id is a refusal

Status: decided (2026-10-30), built in `foldkit-entity`, `foldkit-remote`,
`foldkit-remote-server` and `foldkit-remote-drizzle`.

## The problem

A declared insert (`Mutation.write(name, Write.insert(...))`) names the id the
client chose. When a row already holds it, remote-drizzle's writer failed with
`RemoteServerError("Todo t-x could not be created")`, on SQLite, Postgres and
D1 alike. `RemoteServer.answer` sends a `RemoteServerError` as a 500, the same
status as a crash, and the client's failed write carried no `refusal`. An
application could tell a taken id from a broken server only by parsing an
English message.

## Decision

```text
writer.insert ──RemoteTaken──▶ RemoteServer.write ──refuse(M, Taken { entity, id })──▶ 409 { error, refusal }
                                                                                         │
client: MutationFailed { error: RemoteMutationError { refusal } } ──▶ Data.failedWrites(model, M)[i].refusal = Some(Taken)
```

1. **The refusal is `Refusal.taken`**: `Schema.TaggedStruct('Taken', { entity,
   id })`, with `Refusal.isTaken`. It holds the Entity's name and the id, both
   of which the caller sent, and nothing else: no value, no revision.
2. **A declared insert is refused with `Taken | Invalid`.** `Conflict` leaves
   its type: an insert expects no revision, and nothing ever refused one as a
   conflict. To type it, `Write` takes its kind as a third parameter
   (`Write<E, Fields, 'Insert'>`), which `Write.insert`, `Write.update` and
   `Write.delete` each set; `RefusalOfWrite<W>` reads it. A write typed with
   the kind left open (`AnyWrite`) may be refused with any of them.
3. **A writer says "taken" with `RemoteTaken`** (`RemoteServer.taken()`),
   beside `RemoteUnmet` and `RemoteInvalid`. `EntityWriter.insert` may fail
   with it, and `RemoteServer.write` answers it as the mutation's `Taken`
   refusal. remote-drizzle's writer fails with it where its insert wrote no
   row and its ledger found no record of the operation. A guarded writer
   passes it on.
4. **HTTP 409.** `RemoteServer.answer` sends a refusal that is `Taken` as a
   409, every other declared refusal as a 422, as before. The body is the same
   `{ error, refusal }`, so `Remote.json`, `Remote.http` and the RPC handlers
   carry it with no protocol change, and the client decodes it with the
   mutation's own `Refusal` codec, as it does `Conflict`.
5. **The client settles it as a refusal.** It is a `RemoteMutationError` with
   a `refusal`, not `Unreachable`, so `Data.mutate` lists it in
   `Data.failedWrites` and a durable write leaves the outbox's queue as
   failed, kept until retried or dismissed; it is never sent again on its own.
   The client does not predict it: whether an id is taken is the server's
   fact, and a cache that holds the row may be stale. `Law.check` compares it
   by value like any refusal, so a client that showed the create as made
   disagrees with a server that refused it.

## The ledger

A ledgered insert is a retry when the ledger holds its operation for the same
request: it is answered from the record, never refused. Only an insert that
wrote nothing and has no record is refused as taken. That holds on SQLite (a
synchronous transaction), Postgres (an awaited one under an advisory lock) and
D1 (a read, then one batch whose record is written only where the insert
changed a row). An operation id sent again with another request is still the
server's error, as before: it is a client bug, not a taken id.

Without a ledger, a create sent again after its answer was lost is refused as
taken too, since nothing tells it from another create of the id. A durable
write needs a ledgered writer for that reason.

## What it reveals

Less than the published remote-drizzle 0.15.0, and no more than Unreleased
before it. 0.15.0 answered a create of a taken id with the row whenever the row
held the proposed values, which confirmed a hidden row's values (#203). The
Unreleased fix answers every create of a taken id alike, whatever the row holds
and whether its asker may read it (the #284 audit, "No existence oracle"):
that answer said the id was taken, and so does this one. The refusal is built from the request alone,
so it is identical for a row the asker can read, one hidden from them, and one
holding exactly what they proposed. What runs before it is unchanged: a
guard's create rules (`Forbidden`) and the Entity's invariants over the
proposed row (`Invalid`) are judged without reading the row there, so they
answer the same whether the id is taken or not. Only the status (409 for 500)
and the typed body change.
