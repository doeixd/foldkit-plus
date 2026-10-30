# A replica's id comes from its store (#336)

Status: built (2026-10-30) in `foldkit-sync`: `openReplica(storage, { replicaId? })`
and `Sync.tabStorage(name)`, used by every browser example.

## The problem

A replica's operations are numbered `replicaId:localSequence`, and the
journal refuses an id it has seen. So a replica id must name one store: the
outbox that counts the sequence. `openReplica(replicaId, storage)` made the
application choose the id, and the obvious choice is the person. todo-app
named its replica by the sign-in token; a second browser for the same person
opened a second store under the same id, counted from 1 again, and every
operation it sent was refused as a reused id, with nothing shown. Nothing in
the signature says the id names a store, and the fault shows only with two
browsers.

Every browser example then wrote the same fix by hand: a tab id kept in
`sessionStorage` (so a reload reopens the store and its unsent operations),
an IndexedDB database named after it, and the id passed again to
`openReplica`. Pages also claimed the id with a Web Lock, because a
duplicated tab copies `sessionStorage` and would open the same store; todo-app
and registry did not.

## Decision

```text
Sync.tabStorage(name)            this tab's store: sessionStorage key -> IndexedDB `${name}/${key}`
  -> openReplica(storage)        the store's id: read back, or minted on first open
  -> replica.replicaId           what the operations carry
```

1. **The store mints the id.** `openReplica(storage, options?)` takes the
   storage first. Without `options.replicaId`, it reads the id saved in the
   store, or mints a random one when the store is empty and saves it with the
   first state. Two stores can never share an id unless someone names one, so
   a person's second browser, or second tab, is a second replica by
   construction.
2. **An explicit id stays, as an option.** `{ replicaId }` is for a test
   asserting operation ids, or a server-side replica with a known name. A
   store holding another id still refuses it (`WrongReplicaStorageError`), as
   before. The option's doc says what the id names.
3. **`Sync.tabStorage(name)` is the browser path.** It reads this tab's key
   from `sessionStorage` under `name`, or mints one, and opens IndexedDB as
   `${name}/${key}`. Where `navigator.locks` exists, it holds a lock on the
   key for its scope; a key another live tab holds (a duplicated tab) is not
   reused, and this tab mints a new one. Without locks, a duplicate opens the
   same store and its writes fail the compare-and-swap, which stays the last
   guard. The dependencies are options, so a test passes its own.
4. **Breaking.** `openReplica(replicaId, storage)` becomes
   `openReplica(storage, { replicaId })`. One signature with an optional id
   rather than two overloads whose first argument changes type.

## Rejected

- **A `ReplicaId.tab()` that only reads or mints the tab's id.** The
  application would still pass the id and the storage separately and could
  pair them wrongly; the store owning the id removes the pairing.
- **Detecting a reused id on the client.** Only the journal sees two stores'
  operations; it already refuses them.

## Tests

- `openReplica(storage)` on an empty store mints an id, and a second open of
  the same storage returns the same id; two stores get different ids.
- An explicit id over a store holding another is still refused.
- `tabStorage` reuses the key across a "reload" (same `sessionStorage`),
  mints a new key when another holder has the lock, and keeps the key out of
  a second name.
