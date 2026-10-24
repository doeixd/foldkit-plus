# Preconditions on a declared write

**Status:** Proposed and built, 2026-10-24, with §5's proposals taken as
decided. Tests: `packages/remote-drizzle/test/precondition.test.ts`,
`packages/guard/test/pinned.test.ts`, mutations in
`packages/remote-drizzle/test/precondition.mutations.ts`. #182 §3 ("static
preconditions and well-defined outcomes"), the step after
[guard-atomic-DESIGN.md](./guard-atomic-DESIGN.md). Expression assignments
(§2), dependency analysis (§4) and computed-write retries (§5) are later steps.
**Target:** `foldkit-entity` (`Write`), `foldkit-remote` (`Mutation.write`,
`Refusal`), `foldkit-remote-server` (`EntityWriter`, `RemoteServer.write`),
`foldkit-remote-drizzle` (`writer`), `foldkit-guard` (`GuardServer.writer`).

## 0. What is missing

A declared write says which row and which values, and optionally the revision
the client read. It cannot say *when the operation makes sense*: "publish only
a draft", "reserve only while stock covers the quantity". Today that check is a
handler's (`RemoteServer.mutation`), read before the write in a second
statement, with the same race §0 of the guard design closed for authorization.

Three things stay distinct, though two now share `Expr`:

| Check | Asks | Decided by | Refusal |
| --- | --- | --- | --- |
| Authorization | may this principal act on this row? | `foldkit-guard` | `Forbidden` |
| Revision | is the row the version the client read? | `expect` | `Conflict` |
| Precondition | does the row's state allow this operation? | the write, `when` | `Unmet` |

## 1. Declaring it

A sketch of the proposed API; `Post`, `Item` and their inputs are illustrative.

```ts
const Publish = Mutation.write(
  'Publish',
  Write.update(Entity.input(Post, Schema.Struct({ id: PostId, status: Status })), {
    id: 'id',
    when: () => Expr.eq(Post.fields.status, 'draft'),
  }),
)
const Reserve = Mutation.write(
  'Reserve',
  Write.update(Entity.input(Item, ReserveInput), {
    id: 'id',
    when: ({ input }) => Expr.gte(Item.fields.stock, input.quantity),
  }),
)
```

- `when` takes the same `({ input }) => Predicate` a `Query.define` body does,
  `input` being an `InputExpr` per key of the write's input, typed by its
  schema. It is built once, at definition, into a query body over the write's
  Entity (`Query.from(entity).pipe(Query.where(…))`), so a field of another
  Entity, or an operand of the wrong type, is refused where `Query` refuses
  it, and both existing evaluators run it unchanged: `evaluate` in memory,
  `compileWhere` over Drizzle.
- It reads the row **before** the write, input values and literals. It does
  not read the principal: a rule about who is asking is a guard.
- `Write.update` and `Write.delete` take it. `Write.insert` does not: there is
  no row to hold a state.
- Values are compared as the store holds them: stored columns, and input
  values encoded by their schema, the space a query's `input` is already in.

## 2. Checked where the write commits

The writer receives the body and the input, and puts the predicate in the
write's own `WHERE`, beside the id and the expected revision:

```text
update post set status = 'published', revision = revision + 1
 where id = ? and revision = ? and status = 'draft'
```

One statement, so the condition holds of the row the write changes, on every
dialect the writer compiles for (SQLite, Postgres, D1), with no transaction.

### 2.1 Telling a miss apart

A write that changes nothing has three possible reasons. After a miss the
Drizzle writer already re-reads the row by id (to recognise a lost answer's
retry); it classifies from that read:

1. no row: as today, `No Todo t1 to update` (`absent` for a delete);
2. at another revision than `expect`: `Conflict`, as today;
3. otherwise the precondition did not hold: `Unmet`.

The row can move between the miss and the re-read, so the reason given is the
first that holds at the re-read. The write itself was atomic; only its
explanation is read afterwards. The re-read returns nothing but the reason.

### 2.2 The contract change

`EntityWriter.update` and `.delete` gain `when: Option<{ body, input }>` in
their context, and fail with a new `RemoteUnmet` error (beside
`RemoteForbidden`) for reason 3. An adapter that ignored `when` would write
unconditionally, so a writer states that it compiles it:
`EntityWriter.preconditions: true`. `RemoteServer.write` refuses at definition
a `Write` with `when` over a writer without it, naming both. The Drizzle
writer sets it; `GuardServer.writer` forwards its writer's.

## 3. Outcomes and their order

`Mutation.write`'s `Refusal` becomes `Conflict | Unmet` for a write declared
with `when`, and stays `Conflict` without one, so existing exhaustive matches
keep compiling. `Refusal.unmet` and `Refusal.isUnmet` join `Refusal.conflict`.

Through `GuardServer.writer`, checks run in this order, each before the next
can speak:

1. the row is hidden from the writer: `Forbidden` (`absent` for a delete);
2. a rule does not hold: `Forbidden`;
3. the input's revision is not the row's: `Conflict`;
4. the precondition does not hold at commit: `Unmet`.

So `Unmet` reaches only a caller already allowed to write the row, and says
nothing a read would not. Without a guard, `Unmet` reaches anyone the server
lets write, which is what an unguarded write already means.

With a `revision` pin, a pinned miss whose re-read finds the row at the pinned
revision is reason 3, not "moved": `Unmet` propagates, and is not retried.

## 4. On the client

The optimistic patch is shown as today and rolled back when the server
refuses, as every refused mutation's is. The client does not evaluate `when`
here: its cached row may be stale or incomplete, and §4 of the issue makes
client prediction its own step.

## 5. Questions reviewed

Each proposal below was taken as written.


1. **The refusal's name and payload.** `Unmet`, with nothing in it, is
   proposed. A `reason` naming which condition (a label given beside `when`)
   would let a form say why; it can be added later without breaking a match.
2. **A lost answer's retry.** "Publish a draft" sets `status: 'published'`; a
   retry after the answer was lost finds the row published and is `Unmet`,
   though the first attempt landed. Proposed: on a precondition miss, a row
   that already holds every value the write sets answers as written, as an
   `expect` miss already does when the row is one revision on and holds them.
   This keeps idempotent assignments retry-safe; it does not make a computed
   write safe, which §5 of the issue handles.
3. **The capability flag.** `preconditions: true` on `EntityWriter`, checked at
   definition, is proposed over requiring every writer to handle `when` (a
   breaking change for any outside adapter that would then write
   unconditionally until updated).

## 6. Tests that must be able to fail

- Over SQLite: a write whose condition holds lands; one whose condition does
  not is `Unmet` and writes nothing; one staged so the row changes to fail the
  condition between an application read and the write is `Unmet` (the race
  closed).
- Reasons apart: absent, `Conflict` and `Unmet`, each alone.
- Order through a guard: a caller who may not see the row gets `Forbidden`,
  never `Unmet`; a stale revision is `Conflict` even where the condition also
  fails.
- A pinned guard write whose condition fails is not retried.
- Definition: `when` over another Entity's field is a type error and a runtime
  refusal; a `Write` with `when` over a writer without `preconditions` throws.
- Type: `Mutation.write` without `when` keeps `Refusal` as `Conflict`.
- A lost answer's retry answers the row (if §5.2 is taken).
- Mutations: drop the predicate from `WHERE`; classify every miss as `Conflict`;
  skip the capability check; each must go red.
