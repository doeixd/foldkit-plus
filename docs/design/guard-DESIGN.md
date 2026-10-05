# Guards: who may do what, declared on the Entity

**Status:** Proposed, 2026-10-05. Nothing built.
**Target:** a new package, `foldkit-guard`, and small changes in `foldkit-remote-server`, `foldkit-remote-drizzle`, `foldkit-remote`, `foldkit-crud`, `foldkit-agent`, `foldkit-cms-drizzle`.
**Inspirations:** this repository's four authorization seams; `doeixd/gen2`'s `AUTHZ2_PLAN.md`, `src/authz/{surface,placement,deny,mutation-plan}.ts` and `rules_implementation_guide.md`.

---

## 0. The decision in one page

Authorization in Foldkit Plus today is four unrelated callbacks with four vocabularies:

| Seam | Declared as | Sees | Denial becomes |
| --- | --- | --- | --- |
| `RemoteServer.entity(E, { authorize })` | `(principal, fields) => fields` | field names, never a row | field settled, read as `Unavailable` |
| `bind(…, { E: { visible } })` / `source(E, { policies })` | `(principal) => SQL \| undefined` | a table | row absent, read as `NotFound` |
| `RemoteServer.mutation(M, run)` | nothing; `run` checks for itself | the input | a message string |
| `Agent.expose(…, { authorize })`, `Sync.make({ authorize })`, `CmsServer.make({ allow })` | three more callbacks | each its own context | each its own shape |

They share no Principal type, no word for what is being attempted, and no way to see the whole picture. A rule about a Todo's owner is written once per seam, and a seam that forgets it is silent.

The decision:

> **A Guard is a named rule attached to an Entity and its members as metadata. Each seam that already authorizes derives its callback from the guards instead of taking one.** The Entity stays a pure declaration. The Principal is declared once. Row rules are `Expr`, so the two evaluators the repository already has, Drizzle's compiler and `evaluate`, run them. Where a rule cannot be placed safely, registration refuses it.

```text
Entity ─ Guards.attach({ row, members, relations })          declared once, as metadata
   │
   ├─ Guards.source(E)   → RemoteServer.entity's authorize + a per-row member filter
   ├─ Guards.binding(E)  → remote-drizzle's visible + relation policies
   ├─ Guards.guarded(…)  → a mutation's checks, derived from its Entity.input
   ├─ Guards.variant(…)  → an Agent variant's authorize
   ├─ Guards.may(…)      → derived members the server answers: the client's non-authoritative hint
   └─ Guards.matrix(…)   → the whole picture as data, committed and diffed
```

It is the `foldkit-metadata` pattern the entity design (§1) reserved for exactly this: "An Entity should not know whether a user is authorized to update it"; another package attaches that and interpreters read it.

---

## 1. What gen2 contributes, and what is left there

gen2's AUTHZ2 is a compiler's authorization model. Five of its ideas are worth taking as they are:

1. **Surfaces, not strings.** The *where* of a check is typed: entity read, field read, field write, relation link and unlink, action execute, query filter. A string action name cannot be checked.
2. **Placement is a result, and failure is conservative.** A rule can run in SQL, before a read, after a read per row, or on the client as a hint. A list rule that cannot be pushed into the query is refused, never post-filtered: post-filtering a page breaks pagination and leaks counts.
3. **Deny is explicit per surface**, with a default derived from the surface: a hidden row is `not_found`, a hidden field is `omit`, a refused write is `forbidden`. Foldkit's existing behaviour is exactly these defaults, so adopting the vocabulary names what already happens.
4. **A mutation's checks are derived from its write set.** gen2 computes the write set by analysing the action body. Foldkit already has the write set as data: `Entity.input` says which members an input writes.
5. **An access matrix a person can read**, committed beside the code so a review sees an access change as a diff. `Agent.toManifest` is the same idea for capabilities.

And its own first principle: *rules are logic, not authz*. The predicate language knows nothing about actors; the authorization layer supplies actor values as variables. Here `Expr` is the predicate language and stays principal-free.

Left in gen2, on purpose: the graph dialect and claim nodes, nine placement kinds (this repository has two evaluators, so two placements and a refusal), `mask`, row-level security, client-side rule evaluation, and roles as a built-in. gen2 is a compiler that emits SQL and UI; this is a runtime with a small IR. Its own advice, "start boring", applies.

---

## 2. Vocabulary

```text
Principal     who. One type per application, declared once.
Interaction   what is attempted. Read, Write, or one the application names (Publish, Archive).
Surface       where it lands:  row · member · relation · query · mutation.
Guard         a named rule. Two kinds, by what it may look at:
                principal guard   (principal) => boolean | Effect<boolean>   row-blind: runs anywhere
                row guard         (principal) => Expr over the Entity        needs the row: SQL or evaluate
Deny          what a refusal looks like, defaulted by surface, overridable where the surface admits it.
Placement     where a guard runs, decided at registration, never at request time.
```

The split into two guard kinds is the whole design. A principal guard can run before anything is read, so it serves field authorization and write gating directly. A row guard needs the row, so it either compiles into the query (rows the principal may not see never leave the database) or runs over a row already in hand. Nothing else is needed, and nothing else is offered.

---

## 3. Declaring

### 3.1 The principal, once

```ts
import { Guards as G } from 'foldkit-guard'

type Principal = { readonly id: UserId; readonly role: 'admin' | 'member' } | null

const Guards = G.forPrincipal<Principal>()
```

`forPrincipal` returns the whole namespace specialised to `P`. Every guard it makes carries `P` in its type, every derivation it offers produces a callback typed for `P`, and a server built from them is a server for that `P` only. This is the shared Principal the repository lacks: `RemoteServer.handlers`, the live hub, `Agent.withPrincipal` and `journalExchange` all take the same `P` from the guards they are given, instead of each inferring its own.

`null` is a legitimate principal: a visitor. A guard that reads `principal.id` on a nullable `P` is a type error at the guard, which is where it should be.

### 3.2 Guards

```ts
import { Expr } from 'foldkit-entity'

// Row-blind. Runs before any read, in memory, on either side.
const isAdmin = Guards.principal('isAdmin', principal => principal?.role === 'admin')
const signedIn = Guards.principal('signedIn', principal => principal !== null)

// Needs the row. An Expr over the Entity's own fields; principal values are inputs.
const isOwner = Guards.row('isOwner', Todo, principal => Expr.eq(Todo.fields.ownerId, principal.id))
```

`Guards.row` takes the Entity so the body is checked against it where it is written, as `Query.where` refuses a foreign field. The `principal` parameter is a **placeholder record**, not the value: each property read mints an `Expr.input` named by the path (`principal.id` is the input `principal.id`), typed from `P`. The body is built once at definition time, so `principal.role === 'admin' ? a : b` is impossible to write correctly and is a type error: a placeholder is an `InputExpr`, not a string. This is the existing `Expr.input` discipline, enforced by the type rather than remembered.

A row guard over a nullable `P` reads its fields through nullable placeholders: `principal.id` is `InputExpr<UserId | null>`. `Expr.eq` today refuses a nullable operand against a non-nullable field where it is written, so the guard package must either widen that one comparison for placeholders or require the author to say what a visitor gets (`Guards.row` over the non-null half of `P`, with `null` handled by a principal guard). Open question 5 decides; either way `evaluate` and SQL agree that `null = x` matches nothing, which is what "a visitor owns nothing" should mean.

Composition:

```ts
Guards.all(isOwner, signedIn)   // conjunction, as one guard; principal and row guards may mix
Guards.nobody                    // the explicit deny
```

A list of guards on a surface is a **disjunction**: `[isOwner, isAdmin]` is "owner or admin", the common case. Conjunction is one guard. There is no `Guards.any`, because the list is it, and no `Guards.not`: gen2's safety model defers negation for SQL placement until null semantics are settled, and nothing here has needed one.

### 3.3 Attaching

```ts
const Archive = Interaction.make('Archive')

const Todo = Entity.define('Todo', TodoStruct).pipe(
  Guards.attach({
    row: {
      Read: [isOwner, isAdmin],
      Write: [isOwner],
      [Archive]: [isAdmin],
    },
    members: {
      notes: { Read: [isOwner] },                                        // deny: omit (default)
      email: { Read: Guards.on([isOwner], Guards.redact('hidden')) },    // deny: redact
      ownerId: { Write: [isAdmin] },                                     // deny: forbidden (default)
    },
    relations: {
      comments: { Read: [isOwner], Link: [isOwner], Unlink: [isAdmin] },
    },
  }),
)
```

Typing, which is what makes the attachment safe to write:

- `members` and `relations` are mapped over `keyof E['fields'] | keyof E['derived']` and `keyof E['relations']`: a key the Entity lacks is an error at the key.
- Interaction keys are `'Read' | 'Write' | InteractionKey`, where `Interaction.make` returns a value whose `key` is a `unique symbol`-branded string, so `[Archive]` is a computed key and `'Archvie'` is an error. A relation admits `Read | Link | Unlink`; a member admits `Read | Write`; the row admits any interaction.
- `Guards.row(name, E, …)` is a `RowGuard<P, E>`, and a surface of `Todo` accepts only `RowGuard<P, typeof Todo>` or `PrincipalGuard<P>`. A guard written over `Post` cannot be attached to `Todo`.
- `Guards.redact(value)` is typed by the member's schema: `redact('hidden')` on a `Schema.Number` member is an error.

Semantics fixed here:

- **No entry means allowed.** That is today's "omitting `authorize` means readable", kept so attaching guards is additive. `Guards.nobody` is the explicit deny.
- **A member is reachable only if its row is.** Member and relation rules narrow, never widen.
- **Reading a relation** is reading the relation member of the owner's row, then the target's own row rules apply to what it points at. `Link` and `Unlink` are writes to the relation member, distinguished because the input tells which: a value that gains refs links, one that loses refs unlinks.
- **Attachment is `Entity.annotate` / `annotateMembers` under one `Metadata.key`**, so `Entity.same` holds, an interpreter that does not know the key ignores it, and attaching twice merges: later guards on a surface are appended to the disjunction, a later `deny` replaces. The key's `summarize` prints `Read: isOwner | isAdmin → not_found`, so `Metadata.summarize` already shows the policy.

### 3.4 Deny, per surface

| Surface | Admits | Default | Why the default |
| --- | --- | --- | --- |
| row · Read | `not_found` only | `not_found` | existence must not leak; the server already settles without a read when every field is withheld |
| member · Read | `omit`, `redact(value)` | `omit` | `omit` is today's settled field, read as `Unavailable`; `redact` is new |
| relation · Read | `omit` | `omit` | a hidden relation reads as an empty list or a `null` ref, as `visible` does today |
| any write | `forbidden`, `explain(reason)` | `forbidden` | `explain` carries a sentence to the refused caller, as Sync's `{ allowed: false, reason }` does |

`forbidden` is a tagged refusal with no reason, so a probing client learns nothing but "no". `explain` is for the application's own users: "Only an editor may publish." The CMS's `allow` already behaves as `explain` in spirit; §8 re-expresses it.

---

## 4. Placement: decided at registration

Where each guard runs follows from its kind and surface. There is no runtime fallback.

| Guard | Surface | Runs | When it cannot |
| --- | --- | --- | --- |
| principal | any | before the read, inside `allowedFields`; before `run` for a write | — |
| row | row · Read, and every query over the Entity | compiled into the binding's `visible`; `evaluate` in `RemoteServer.memory` | **`Guards.binding` throws at registration**, naming the guard and the operator, as `Query.unsupported` does for a body |
| row | member · Read | after the read, per fetched row, with `evaluate` over the record | — : rows are already bounded by id, so a per-row field filter is exact |
| row | write on an existing row | before `run`, over the row read under `visible` | the row is hidden: `forbidden`, not `not_found`, since the caller named the id |
| row | write on a new row | before `run`, with `evaluate` over the proposed values | a field the guard reads that the input does not set: `forbidden` |

Two of gen2's conclusions are load-bearing in this table. **Post-filtering is unsafe for membership and safe for fields:** a row guard on `Read` of the row is only ever SQL (or `memory`'s whole-table `evaluate`), while a row guard on a member runs over records the query already bounded. **A placement failure is a definition-time error:** gen2 emits `authz:list-policy-not-placeable`; here the same fact throws from `Guards.binding`, which is how this repository treats every other body an interpreter cannot run.

A principal guard that returns an `Effect` carries its requirements `R` onto the Source, exactly as `read`'s `R` does today, and so to `handlers`. A guard that needs a service (a membership lookup) names it in its type; the server that lacks it does not compile.

---

## 5. Reading them out, per seam

Each seam gets one derivation in place of a hand-written callback. The derivations are small because every seam already has the hook; what is new is that they agree.

### 5.1 Reads: `foldkit-remote-server`

```ts
RemoteServer.entity(Todo, { read, ...Guards.source(Todo) })
```

`Guards.source(E)` yields `{ authorize, filter }`:

- `authorize(principal, fields)` runs the row's principal `Read` guards (all fail: no fields, so the id is settled unread and looks absent) and each requested member's principal `Read` guards.
- `filter(principal, record)` is **new on `EntitySource`**: run by `readHelper` after `source.read`, it evaluates each member's row `Read` guards over the record and settles (`omit`) or replaces (`redact`) the member's value. It is skipped when no member has a row guard, so an Entity without guards costs nothing.

Row `Read` row-guards are not applied here: the Source's own read must already honour them (`memory` does through `evaluate`; Drizzle through `visible`). `Guards.source` records which guards it expects the Source to have placed, and `RemoteServer.validate` checks that a Source for a guarded Entity was built from a binding that placed them (§5.2), so a hand-written Source over a guarded Entity is a startup error, not a silent hole.

### 5.2 Rows: `foldkit-remote-drizzle`

```ts
const Db = bind(Domain, {
  Todo: { table: todos, ...Guards.binding(Todo) },
})
```

`Guards.binding(E)` yields `{ visible, policies }`: `visible(principal)` is the row `Read` guards compiled with `compileWhere`, as a disjunction, with principal placeholders bound from the principal at request time; `policies` are the relations' `Read` row guards, one SQL predicate per collection, as `source(…, { policies })` takes today. The binding records the guards it placed, which §5.1's validation reads.

This fixes the `Visible = (principal: unknown) => …` type the CMS casts around: `Guards.binding` is typed for `P`, and `bind` carries `P` from it.

A query over the Entity is conjoined with `visible` already (the compiled body, the server's `where`, then `visible`), so a body never widens what a principal may see. Nothing changes there.

### 5.3 Writes: `foldkit-remote-server` mutations

A mutation declares its interaction and an `Entity.input`:

```ts
const ArchiveTodo = Mutation.make('ArchiveTodo', {
  Input: Entity.input(Todo, Schema.Struct({ id: TodoId })),
  Output: { id: TodoId },
  interaction: Archive,            // default: Write
})

RemoteServer.mutation(ArchiveTodo, Guards.guarded(({ input, principal, row }) =>
  Effect.gen(function* () { /* write; `row` is the Todo as read under visible */ }),
))
```

`Guards.guarded` derives the plan from the input, so the author has nothing to remember:

1. **The row's `[interaction]` guards.** For an input that names an existing id (its mapping includes the `id` field), the row is read first under `visible` and the guards run over it; a row the principal may not see is `forbidden`. For an input with no `id`, the row guards run with `evaluate` over the proposed values; a field a guard reads that the input leaves unset is `forbidden`.
2. **Each mapped member's `Write` guards.** `Entity.input` says which members the input writes; an `Entity.unmapped` key is about the operation and is not checked.
3. **Each mapped relation's `Link` or `Unlink` guards**, by whether the value adds or removes refs against the row read in step 1.

A refusal is a `RemoteServerError` of tag `Forbidden`, with `reason` only when the surface's deny is `explain`. The handler never runs.

A mutation whose input maps a guarded member but is registered **without** `guarded` is gen2's "generated input overpermits field". `RemoteServer.validate(domain, server)` already walks mutations; it gains this check and fails startup.

This also gives `Crud.editor` its create/edit distinction for free: the same mutation serves both when its input admits an optional `id`, and the plan branches on whether the id is present.

### 5.4 Agents: `foldkit-agent`

```ts
Agent.expose(Message, {
  RequestedArchive: Guards.variant(Todo, Archive, {
    description: 'Archive a todo',
    input: Schema.Struct({ id: TodoId }),
    toMessage: ({ id }) => ({ id }),
    row: ({ id }, model) => Data.get(TodoRow, id),   // where the row is in the Model
  }),
})
```

`Guards.variant` fills `authorize` with the row's principal guards and, when `row` is given and `Ready`, the row guards evaluated over the Model's copy. It is a gate on the client, not the trust boundary: the Message's mutation is checked again on the server under the server's own principal. The variant is typed for the application's `P`, which is what `Agent.forApplication(App).withPrincipal<P>()` now takes from the guards.

### 5.5 Sync and the CMS

Sync's `authorize` per durable variant stays as it is: a Sync document is not an Entity, and its policy sees the authoritative snapshot, which guards do not model. The CMS re-expresses `isAuthor` and `allow` as guards in §8.

---

## 6. The client's hint: `may`

The client needs to grey out a button for the reason the server would refuse it, and must not run the rule itself: the client's copy of the row may be stale or incomplete, and a client is not the trust boundary. gen2 calls this `ui.hint`, non-authoritative by construction. This repository already has the mechanism: a **derived member** the server supplies.

```ts
const TodoRow = Entity.select(Todo, {
  title: true,
  may: Guards.may(Todo, [Archive, Write]),                 // { Archive: boolean, Write: boolean }
  mayWrite: Guards.may.members(Todo, ['notes', 'ownerId']),  // { notes: boolean, ownerId: boolean }
})
```

A Selection can only name members the Entity has, so `Guards.attach` **adds two derived members** to the Entity it attaches to: `may`, a `Struct` of one boolean per interaction that has row guards, and `mayWrite`, one per member or relation with `Write`, `Link` or `Unlink` guards. `Guards.may(...)` and `Guards.may.members(...)` are typed narrowings of those two members for a Selection, so a Selection reads only the answers it draws. A Source built from `Guards.source` supplies them like any derived member, under the principal, by running the same guards over the row it just read; a hand-written Source that omits them settles them, which the client reads as `Unavailable` and Crud as "not yet known". The answer is exact for the principal and row at the moment of the read, and it is data in the Model, so it is `Refreshing` or stale exactly as the row is.

Consumers:

- **`Crud.editor`:** `editor.may(model, Archive)` reads it from the loaded value, `false` until read, as `foldkit-cms`'s `may` works today. `Crud.editor` also learns `readonly(model, 'ownerId')` from `may.members`, so `foldkit-mixins-form` draws the field disabled: gen2's `ui.hint: readonly` without a client rule.
- **A list:** `Guards.may` in a list's Selection answers per row, so a row's actions are drawn per row.

Nothing on the client evaluates a guard. A later version could evaluate principal guards client-side for instant hints; it is not in this one, because the server's answer is cheap and exact.

---

## 7. The matrix

```ts
Guards.matrix([Todo, Post])
```

returns a serializable value: for every Entity, every surface, every interaction with guards, the guard names, their kinds, the placement decided, and the deny. `Guards.matrix.toMarkdown` renders it:

```text
Todo
  row       Read     isOwner | isAdmin        sql · evaluate      not_found
  row       Write    isOwner                  row-before-run      forbidden
  row       Archive  isAdmin                  principal           forbidden
  notes     Read     isOwner                  per-row             omit
  email     Read     isOwner                  per-row             redact
  ownerId   Write    isAdmin                  principal           forbidden
  comments  Read     isOwner                  sql policy          omit
  comments  Link     isOwner                  row-before-run      forbidden
```

Commit it beside `agent.json`. A principal guard's body is a closure the matrix cannot print, which is why guards are **named**: the name is the contract, and a change in the body is a change in the code review of that name's definition.

---

## 8. The CMS, re-expressed

`foldkit-cms-drizzle` is the one place the repository already enforces an audience boundary across every read path, and it does so by hand: `published(column, isAuthor)` for content rows, `authorsOnly` for its three tables, `isAuthor` before every operation, `allow(principal, transition, entry)` for transitions, and a `principal as P` cast where `Visible` is untyped.

With guards:

```ts
const isAuthor = Guards.principal('isAuthor', principal => principal !== null)
const isEditor = Guards.principal('isEditor', principal => principal?.role === 'editor')
const isPublished = Guards.row('isPublished', Post, () => Expr.isNotNull(Post.fields.publishedAt))

const Post = Entity.define('Post', …).pipe(
  Guards.attach({ row: { Read: [isPublished, isAuthor] } }),      // visitor: published; author: all
)

const cms = CmsServer.make({
  …,
  transitions: { publish: [isEditor], schedule: [isEditor], unpublish: [isEditor] },
})
```

`CmsServer.make` attaches `Read: [isAuthor]` to its own Entry, Draft and Revision Entities, `Write: [isAuthor]` to its operations, and the transition interactions to the entry row; `cms.sources` come out of `Guards.source`. Its current startup check, "a type with a `published` role whose binding shows every row to everyone", becomes "its Entity has no row `Read` guard", which is the same fact read from metadata instead of from the presence of a function. `allow` stays as an escape hatch for a rule about the entry's own state that a guard over the content row cannot say.

---

## 9. Failure and denial, end to end

| Cause | Server | Wire | Client |
| --- | --- | --- | --- |
| member Read refused, `omit` | field settled, unread | in `settled` | `RemoteData` `Failed`, `error._tag: 'Unavailable'`; not planned again |
| member Read refused, `redact` | value replaced | in `entities` | `Ready`, with the replacement; the client cannot tell, by design |
| row Read refused | not returned, not settled | absent | tombstone, `NotFound`: "does not exist, or this principal may not see it" |
| write refused, `forbidden` | `RemoteServerError` `Forbidden` | `RemoteMutationError` with `_tag: 'Forbidden'`; HTTP 403 from `answer` | `MutationFailed`; `Data.mutation(model, id)` is `Failed` with a `Forbidden` error; Crud `SaveFailed` can say so |
| write refused, `explain` | the same, with `reason` | the same, with `reason` | the reason, for the user who asked |
| agent variant refused | — | — | `AgentAuthorizationError`, audited as `refused` |

The two new facts on the wire are the `Forbidden` tag and its optional `reason`. `Remote.http` learns to keep the status it drops today, so a non-JSON 401 from the application's own authentication becomes a tagged error rather than `Error("401 Unauthorized")`.

---

## 10. What the existing packages change

Small, and each is a gap already named in the current code walk.

1. **`foldkit-remote-server`.** `EntitySource.authorize` may return `Effect<readonly string[], never, R>`; `EntitySource.filter?` is added and run by `readHelper`; `RemoteServerError` gains the `Forbidden` variant; `answer` maps it to 403; `validate` checks guarded Entities have placed Sources and guarded inputs have `guarded` mutations; `handlers` takes `P` from the Server definition, which takes it from its Sources. `RemoteServer.memory`, which authorizes nothing today, applies a guarded Entity's row `Read` guards with `evaluate` over its rows and runs `filter`, so the in-memory backend and the Drizzle one answer the audience tests alike.
2. **`foldkit-remote-drizzle`.** `Visible` becomes `Visible<P>`; `bind` carries `P`; a binding records which guards it placed.
3. **`foldkit-remote`.** `Mutation.make` accepts an `Entity.input` as `Input` and an `interaction`; `RemoteMutationError` gains the `Forbidden` tag and `reason`; `Remote.http` keeps the status; `Data.mutation`'s `Failed` exposes the tag.
4. **`foldkit-entity`.** Nothing. `Guards` is metadata; `Expr.input` and `evaluate` are what they are. A `Guards.row` placeholder record is built from `P`'s type with `Expr.input`, in the guard package.
5. **`foldkit-crud`.** `may` and `readonly` read from a value selected with `Guards.may`; `Crud.editor` branches create and edit on the input's optional `id`.
6. **`foldkit-agent`.** `withPrincipal<P>()` is inferred from a `Guards.variant`.
7. **`foldkit-cms-drizzle`.** `published`, `authorsOnly`, `isAuthor` and `allow` re-expressed over guards (§8); the `principal as P` casts go.

---

## 11. What this deliberately does not do

- **No client-side rule evaluation.** `may` is the server's answer. Instant local hints are a later addition, and gen2's "sound-allow / sound-deny / best-effort" modes are the vocabulary for that day.
- **No roles as a built-in.** A role is whatever `P` says; `Guards.principal('isAdmin', …)` is one line. A built-in `Guards.role('admin')` would fix `P`'s shape.
- **No new operators.** A rule SQL cannot express (`or` across fields inside one guard, `in`) waits for the `Expr` operator, as queries do; `data-query-DESIGN.md` Phase 13 is where joins and aggregates live. A row guard that needs `exists` over a relation is not expressible yet, and says so at `Guards.binding`.
- **No second evaluator.** Row guards are `Expr`, run by the two evaluators the conformance suite already keeps in agreement.
- **No negation.** gen2 defers `not` for SQL placement until null semantics are settled; nothing here has needed one. `Expr.isNull`/`isNotNull` cover absence.
- **Sync is unchanged.** Its policy sees a document snapshot, not an Entity.

---

## 12. Build order

Each slice stands alone, is committed with its tests, and is reviewed before the next.

1. **`foldkit-guard` core.** `forPrincipal`, `principal`, `row` (with the placeholder record), `all`, `nobody`, `Interaction.make`, `attach`, the Metadata key, `redact`/`explain`, `matrix`. Pure. Tests: attachment typing (`types.test-d.ts` with `@ts-expect-error` for a foreign key, a foreign Entity's row guard, a branching placeholder, a mistyped redact); `evaluate` over a row with the principal bound; merge of two attachments; the matrix as a snapshot read back.
2. **Reads.** `Guards.source` and `Guards.binding`; `EntitySource.filter`; the placement throw; `validate`'s placed-Source check. Test in `examples/kitchen-sink`: one Todo read as owner, admin and visitor, by id, through a relation, through a query, through `memory` and SQLite, asserting `NotFound`, `Unavailable`, a redacted value, and the hub re-reading under each subscriber's own principal. Mutation-test by deleting the `visible` conjunction and the per-row filter.
3. **`Forbidden` end to end.** Server error, `answer` 403, `Remote.http` status, client tag, `Data.mutation`.
4. **Writes.** `Mutation.make` with `Entity.input` and `interaction`; `Guards.guarded` with the input-derived plan; `validate`'s overpermits check. Tests: create with a guard over an unset field, update of a hidden row, link and unlink, `explain`'s reason reaching the client.
5. **`may`.** The derived member; Crud's `may` and `readonly`; `mixins-form` disabled fields.
6. **Agent.** `Guards.variant`; `withPrincipal` inferred.
7. **CMS.** §8; the casts removed; the example's `isAuthor`/`allow` rewritten; the e2e audience test unchanged and green.
8. **Docs.** `packages/guard/README.md` in the onboarding order; a row in `SKILL.md`'s table and `references/guard.md`; `remote.md`'s authorization gotchas pointing here; `CHANGELOG.md` entries per slice.

---

## 13. Open questions

1. **Should `Guards.row`'s placeholder be the only way to reference the principal in an `Expr`,** or should `Expr.input('principal.id', …)` written by hand also be recognised by `Guards.binding`? The placeholder is safer; recognising the hand form keeps one IR. Leaning: placeholder only, since a hand-written input name is a string the type cannot check.
2. **Does `redact` belong in the first version?** It is the only deny the client cannot distinguish from a real value. It is in because gen2 found it needed (a masked email in a list), and because without it an author reaches for a second Selection per role.
3. **Where does a row guard on a derived member run?** A count the binding computes under `policies` is already principal-aware; a `supplied` derived member has no row to evaluate against until the application supplies it. Leaning: `Guards.attach` refuses a row guard on a `supplied` derived member.
4. **Should `Guards.matrix` be a check?** A committed matrix that `validate` compares against the live one would catch an unreviewed access change at startup. Cheap once the matrix exists; not in slice 1.
5. **How does a row guard speak about a nullable principal?** `Expr.eq` refuses a nullable operand against a non-nullable field. Options: the guard package widens that comparison for principal placeholders only, with SQL's `null = x` semantics; or `Guards.row` takes the non-null half of `P` and a principal guard (`signedIn`) stands in front of it in a `Guards.all`. Leaning: the second, because it adds no special case to `Expr` and reads as what it means.
