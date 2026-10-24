# Guards that hold when the write lands

**Status:** Proposed, 2026-10-24. Nothing built. Answers #182 §1 (atomic guard
enforcement); §2–§5 of that issue (expression assignments, preconditions) build
on it and are out of scope here.
**Target:** `foldkit-guard` (`GuardServer.writer`), a sentence in
`foldkit-remote-server`'s `EntityWriter` contract, `foldkit-remote-drizzle`
unchanged.

## 0. The gap

`GuardServer.writer` reads the row, decides its rules over it, then calls the
writer it wraps (`packages/guard/src/server.ts`, `update` and `delete`). These
are separate statements. A change landing between them is not seen:

```text
A: read Todo t1 (ownerId = a)   rules hold for a
B: update t1 set ownerId = b    (B may)
A: update t1 set title = 'x'    lands: a wrote b's row
```

The README says so (`packages/guard/README.md`, Limits: "A write's check and
the write are two statements"). A write whose input `expect`s a revision is
already safe, because the writer then writes only a row still at that
revision. A write that expects none takes the window.

## 1. What a guard's decision reads

Everything the write rules of `GuardServer.writer` decide on is:

- **the principal**, resolved once per request on the server; it does not
  change during one write;
- **the row itself**, `before` (read under the writer's `read`) and `after`
  (`before` with the write's values and links applied);
- **nothing else.** Member rules and link rules are row rules over this
  entity's row (`Policy.writeMembers`, `Policy.linkable`), and the writer
  evaluates `Inherit` as `false` (`Condition.holds(…, () => false)`), so no
  write rule reads another row.

So the decision is a pure function of the principal and one row version. If the
write lands on exactly the version that was checked, the check and the write
are atomic, whatever else happens between them.

## 2. The decision

> **The guard pins every update and delete to the revision of the row it
> checked.** It reads the row's revision with the fields its rules need and
> passes it as the writer's `expect`. The writer already writes only a row still
> at that revision, in one statement (`remote-drizzle`'s `writer`:
> `update … where id = ? and revision = ?`, with the revision bumped in the
> same statement). A miss means the row moved after the check: the guard checks
> again against the row as it now is, and writes pinned to that.

```text
read row + revision r -> decide rules -> write where revision = r
                                          | miss
                                          v
                              read again, decide again (bounded)
```

No transaction, no lock, no isolation level. Every adapter that keeps the
`expect` contract (one statement, compare and set) gets this, D1's single
statements included, which a transaction-based design could not reach.

### 2.1 Declaring the revision

`GuardServer.writer(entity, policy, writer, { revision: 'revision' })` names the
field. It must be a field of `entity` (checked at definition time, as `presets`
are), its stored value must change on every write to the row, and the writer
must be able to compare it (`expect`'s `field`).

### 2.2 When the input expects a revision too

The client's `expect` and the guard's pin name one row version or none:

- the row read is at the client's revision: write with it, as today;
- it is not: the write would miss anyway, so refuse it as a `Conflict` now,
  before deciding any rule; no retry, since the client asked for that version.

### 2.3 The retry

A pinned miss the client did not ask for is retried: read, decide, write,
at most three attempts. Each attempt is a fresh decision, so a row that moved
out of the writer's reach is refused (a hidden row as absent, as today), and
one that moved within it is written. After the last miss the write fails with
a `RemoteServerError` ("changed while it was written"), never with a write on
an unchecked version. The retry is invisible to the client except as latency;
it discloses nothing a read would not.

### 2.4 Insert

A create's rules hold over the values it proposes and the principal: there is
no stored row to change under it, so it is atomic already. Nothing changes.

## 3. What it does not cover

Say each in the Guard README in place of today's Limit:

- **A store written around the revision.** A raw SQL write, or a migration,
  that leaves the revision alone defeats the pin. Sync's `applyEdits` moves the
  revision to the commit sequence and keeps it equal for two changes in one
  operation (`<=`); a guarded write between those two statements is not seen.
  Probe this case before claiming Sync composes.
- **Facts outside the row.** A principal whose roles are revoked mid-request,
  or a rule a future change lets read another row (`Inherit` evaluated for
  real, #183's cross-row invariants), is not pinned by one row's revision.
  Such a rule needs the related rows' revisions too, or a transaction; refuse
  it at registration until then.
- **An entity with no revision.** Unpinned, as today (§4).

## 4. Open questions for review

1. **Required or opt-in?** Requiring `revision` makes the safe path the only
   path but breaks every `GuardServer.writer` call without one. Opt-in keeps
   them working and keeps the gap. Proposal: opt-in now with a startup warning
   from `GuardServer.validate` for a writer without it; required at the next
   minor.
2. **Retry count.** Three is a guess. A hot row under steady contention fails
   after three; the alternative is no retry, and a `Conflict` the client did
   not ask for.
3. **The landed-already heuristic.** On a miss, `remote-drizzle`'s `update`
   answers a row that is one revision on and holds the written values (a lost
   answer's retry). With a guard pin, another writer's write of the same values
   reads as ours. That is the case today for a client `expect`; keep it.

## 5. Tests that must be able to fail

- The interleaving in §0, staged with a writer that runs B between A's read and
  A's write: A is retried, re-decided against `ownerId = b`, and refused.
- The same with B moving the row within A's reach: A is written on B's version.
- Three moves in a row: A fails with the error, and no write landed.
- A client `expect` that disagrees with the row read: `Conflict`, no rule
  decided (a rule that would refuse is not reported).
- Mutations: drop the pin (pass the client's `expect` only), retry without
  re-reading, and skip the client-expect comparison; each must go red.
