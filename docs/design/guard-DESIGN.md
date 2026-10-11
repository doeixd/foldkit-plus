# Guards: who may do what, declared once on the domain

**Status:** Proposed, 2026-10-05; revised 2026-10-10 against the code as it now stands (Remote's client placement, declared writes, live row logs). Slices 1 (`Expr.in`) and 2 (the core, but `may`) built; the rest not.
**Target:** a new package, `foldkit-guard`, and small changes in `foldkit-remote-server`, `foldkit-remote-drizzle`, `foldkit-remote`, `foldkit-entity`, `foldkit-crud`, `foldkit-agent`, `foldkit-cms-drizzle`, `foldkit-sync`.
**Inspirations:** this repository's authorization seams; `doeixd/gen2`'s `AUTHZ2_PLAN.md`, `src/authz/{surface,placement,deny,mutation-plan}.ts` and `rules_implementation_guide.md`; ZenStack, Ent's privacy layer, Hasura permissions, Postgres row-level security, Firebase security rules, Pundit, Zanzibar, Cedar (§2).
**Related:** `remote-improvement-plan.md` §16 (client placement, Phases 7–12), whose Phase 12 is gated on this design.

Snippets below are the proposed API, not code that compiles today. Every name they use from existing packages (`Entity.define`, `Expr.eq`, `Mutation.write`, `RemoteServer.write`, `writer`, `bind`, `Data.forget`) is the current one; `Guards.*`, `Interaction.*` and `Expr.in` are what this design adds.

---

## 0. The decision in one page

Authorization in Foldkit Plus today is five unrelated seams with five vocabularies, and one write path with none:

| Seam | Declared as | Sees | Denial becomes |
| --- | --- | --- | --- |
| `EntitySource.authorize` (`RemoteServer.entity`, `RemoteServer.memory`) | `(principal, fields) => fields` | field names, never a row | field settled, read as `Unavailable` |
| `bind(…, { E: { visible } })`, `source(E, { policies })` | `(principal: unknown) => SQL \| undefined` | a table | row absent, read as `NotFound` |
| `RemoteServer.mutation(M, run)` | nothing; `run` checks for itself | the input | a message string |
| `RemoteServer.write(M, writer(binding))` | **nothing at all** | the input's keys | none: it writes what the input names |
| `Agent.expose(…, { authorize })`, `Sync.make({ authorize })`, `CmsServer.make({ allow })` | three more callbacks | each its own context | each its own shape |

They share no Principal type, no word for what is being attempted, and no way to see the whole picture. A rule about a Todo's owner is written once per seam, and a seam that forgets it is silent. The declared write is the sharpest case: it exists so that a write needs no handler, and so it has no place for a check.

The decision:

> **Guards are declared once, as data, on the shared domain; their bodies are implemented once, on the server. Each seam that authorizes derives its check from the guards instead of taking a callback, and a declared write is checked with no code at all.** The Entity stays a pure declaration. The Principal is declared once, and its absence (a visitor) is an `Option`. Row rules are `Expr`, so the two evaluators the repository already has, Drizzle's compiler and `evaluate`, run them. Where a rule cannot be placed safely, registration refuses it. Where the client places rows itself, a change it cannot judge under the guards is fetched, never guessed.

```text
shared domain                                   server
──────────────────────────────────────────      ──────────────────────────────────────────
Guards.declare(name, User, guard => …)          G.implement({ bodies })          type-checked complete
Guards.attach(G, { row, members, … })           │
   │  metadata on the Entity                    ├─ Guards.binding(E)  → visible + relation policies
   │                                            ├─ Guards.source(E)   → authorize + per-row member filter
   │                                            ├─ writer(binding)    → a declared write's checks, from its Write
   │                                            ├─ Guards.guarded(…)  → a handler's checks, from Entity.input
   ├─ Guards.guardFields(E)  Remote's impact    ├─ G.Principal        → one Context tag for "who is asking"
   ├─ Guards.may             derived members    └─ RemoteServer.validate → every declared guard placed and implemented
   └─ Guards.matrix(…)       the whole picture as data, committed and diffed
```

§8a–8c say how this meets routing (routes carry no authorization; a `Me` Entity answers the visitor's questions), agents (one principal type with the MCP adapter; a two-mode `variant`), and Sync (a document is one audience, checked by guard identity). §7a says what client placement needs to stay sound once rows can be hidden.

It is the `foldkit-metadata` pattern the entity design (§1) reserved for exactly this: "An Entity should not know whether a user is authorized to update it"; another package attaches that and interpreters read it. And it is the split Remote already makes between a Mutation descriptor the client imports and the Source only the server has.

---

## 1. What gen2 contributes, and what is left there

gen2's AUTHZ2 is a compiler's authorization model. Five of its ideas are taken as they are:

1. **Surfaces, not strings.** The *where* of a check is typed: entity read, field read, field write, relation link and unlink, action execute, query filter.
2. **Placement is a result, and failure is conservative.** A rule can run in SQL, before a read, after a read per row, or on the client as a hint. A list rule that cannot be pushed into the query is refused, never post-filtered: post-filtering a page breaks pagination and leaks counts.
3. **Deny is explicit per surface**, with a default derived from the surface. Foldkit's existing behaviour is exactly these defaults.
4. **A mutation's checks derive from its write set.** gen2 analyses the action body; Foldkit already has the write set as data, twice: a declared write's `Write` (which row, which kind) and `Entity.input` (which members).
5. **An access matrix a person can read**, committed so a review sees an access change as a diff.

And its first principle, *rules are logic, not authz*: `Expr` knows nothing about actors; the guard layer supplies principal values as inputs.

Left in gen2, on purpose: the graph dialect and claim nodes, nine placement kinds (two evaluators here, so two placements and a refusal), `mask`, database RLS, client-side rule evaluation, roles as a built-in. gen2 is a compiler; this is a runtime with a small IR. Its own advice, "start boring", applies.

---

## 2. Prior art, and what each settles

The systems that attach policy to a schema and compile it into queries agree with each other more than they differ, and each settles one point here.

| System | What it does | What it settles here |
| --- | --- | --- |
| **ZenStack** | `@@allow('read', auth().id == owner.id)` on the Prisma model; read rules compile into the query; field-level read rules strip fields after the fetch; update rules see the post-update row (`future()`); a generated `check()` is the UI's hint | the whole shape of §4–§7: row guards into `visible`, member guards per fetched row, the post-update check, `may` as the hint |
| **Ent privacy** | policies on the schema, split into *query rules* that add predicates and *mutation rules* that see the write set | the two placements; mutation checks from the write set |
| **Hasura** | per role and operation: a row *filter* for reads, a *check* against the proposed row for writes, a column allowlist, **session variables** as placeholders in the filter, **column presets** set from a session variable | principal placeholders (§3.3); filter versus check (§5); presets (§6.4) |
| **Postgres RLS** | `USING` for reads, `WITH CHECK` for writes, **per command** (`SELECT`, `INSERT`, `UPDATE`, `DELETE`); permissive policies OR, restrictive policies AND | interactions per command (§3.2); an update checked before and after (§4); a **restrictive** guard that always wins (§3.5) |
| **Firebase rules** | a list is allowed only when the rule is provable from the query; otherwise denied | conservative placement (§4), and conservative client placement (§7a) |
| **Pundit** | `scope` for lists, `show?` for one record, `permitted_attributes` for writes | two placements again; member `Update` |
| **Zanzibar / SpiceDB / OpenFGA** | relation tuples; `viewer: owner \| parent->viewer` | `Guards.inherit` (§6.1); groups as claims or a membership Entity |
| **Cedar** | policy as data, schema-validated; a request is principal, action, resource, context; `forbid` overrides `permit`; default deny | what a guard sees (§3.4); the restrictive guard; the default question (§3.6) |

Two disagreements worth naming. **Default:** Cedar, Firebase and RLS deny by default; Hasura and ZenStack deny once a model has any policy; only this repository's `authorize` is open by default. §3.6 decides. **Where bodies live:** Hasura and RLS run entirely in the database, ZenStack generates a server and a client separately, Ent is server-only Go. All of them keep the rule's logic off the client, which §3.1 adopts.

---

## 3. Vocabulary and declaration

```text
Principal     who. One type per application, declared once; a Context tag on the server
              holding Option<P>: none is a visitor.
Interaction   what is attempted: Read, Create, Update, Delete (Write names the last three),
              or one the application names (Publish, Archive).
Surface       where it lands:  row · member · relation · query · mutation.
Guard         a named rule, declared on the shared domain. Two kinds:
                principal guard   declared by name; its body lives on the server; row-blind
                row guard         an Expr over the Entity's fields; data; SQL or evaluate
Deny          what a refusal looks like, defaulted by surface.
Placement     where a guard runs, decided at registration, never at request time.
```

### 3.1 Declare shared, implement on the server

The Entity is shared domain code the browser imports. A guard body attached to it would ship to the client: bundle weight, leaked logic, and a body that reads a database could not be imported there at all (the trap list records one stray server import adding 180 KB). So the declaration carries **names and Exprs**, which are data, and the bodies are supplied once on the server. The declaration is one object so that completeness is typed, as `defineMessageUnion` types its cases.

A row guard reads an Entity's fields, and the guarded Entity carries the guards, so the two cannot each be defined from the other. The fields come first, from a base Entity; the guards are declared over it; the guarded Entity is the base with the guards attached, and `Entity.same` holds between them, so a guard over the base is a guard over the result:

```ts
// shared
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({
  id: UserId,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(ProjectId),
})

const TodoFields = Entity.define('Todo', TodoStruct)

const G = Guards.declare('Todos', User, guard => ({
  isAdmin: guard.principal(),                                                   // body on the server
  signedIn: guard.principal(),
  isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),    // data; ships
  inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
}), { key: user => user.id, unguarded: 'allow' })

export const Todo = TodoFields.pipe(Guards.attach(G, { … }))                    // §3.2

// server
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
  signedIn: Option.isSome,
})
// A missing or extra key is a type error here: `implement` is mapped over the
// principal guards `declare` was given, and nothing else.
```

The principal is a `Schema.Struct`, not a type parameter: a row guard's placeholders are `Expr.input`s, each needing its field's codec, and `G.inputOf(user)` encodes a principal's values as stored values are encoded, which a type alone cannot do. The guards are built by a function given the builders, so `p` is typed from that schema with nothing to annotate. `name` is the set's identity: the Context key's string and what the matrix prints. (As built in the core slice; an earlier draft had `declare<User>()({ … })`, which would have needed a cast to mint placeholders with no schema.) `G.isOwner` is a `RowGuard<User, typeof TodoFields>`, `G.isAdmin` a `PrincipalGuard<User>`, `G.Principal` the Context tag holding `Option<User>` (§3.4), `G.implement` the only place a body exists. A server is built from a `Policy`, and `RemoteServer.validate` fails startup for a declared guard the server's `Policy` does not implement, which the type already prevents in the common case; the runtime check is for a server assembled from several guard sets.

### 3.2 Attaching

```ts
const Archive = Interaction.make('Archive')

export const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.inProject, G.isAdmin],
      Create: [G.signedIn],
      Update: [G.isOwner],
      Delete: [G.isOwner, G.isAdmin],
      [Archive.key]: [G.isAdmin],
    },
    members: {
      notes: { Read: [G.isOwner] },                                            // deny: omit (default)
      email: { Read: Guards.on([G.isOwner], Guards.redact('hidden')) },        // deny: redact
      ownerId: { Update: [G.isAdmin] },                                        // deny: forbidden (default)
    },
    relations: {
      comments: { Read: [G.isOwner], Link: [G.isOwner], Unlink: [G.isAdmin] },
    },
    always: [G.signedIn],                                                      // restrictive: ANDed with every surface
  }),
)
```

`Write: [...]` is shorthand for the same list on `Create`, `Update` and `Delete`. Per command, as RLS has it, because "may create" and "may delete" are rarely the same rule, and a declared write already knows which of the three it is (§5.3).

Typing, which is what makes this safe to write:

- `members` and `relations` are mapped over the Entity's member keys; a key the Entity lacks is an error at the key.
- Interaction keys are `'Read' | 'Create' | 'Update' | 'Delete' | 'Write' | InteractionKey`; `Interaction.make` returns a value whose `key` is a branded string, so `[Archive.key]` is a computed key and a misspelling is an error. A relation admits `Read | Link | Unlink`; a member `Read | Update` (and `Create`, for a member only some may set); the row any interaction.
- A surface accepts `RowGuard<User, E>` for an `E` that is `Entity.same` as the target, or `PrincipalGuard<User>`, from the same `G`. A guard over `Post`, or from another guard set, is an error.
- `Guards.redact(value)` is typed by the member's schema: `redact('hidden')` on a `Schema.Number` member is an error.

Semantics:

- **A surface's list is a disjunction.** `[isOwner, isAdmin]` is "owner or admin". `Guards.all(a, b)` is a conjunction as one guard; principal and row guards may mix in it.
- **`always` is restrictive.** It is ANDed after every surface's disjunction and cannot be out-voted. A tenant boundary or "signed in" belongs here. Postgres's restrictive policy, Cedar's `forbid`.
- **A member is reachable only if its row is.** Member and relation rules narrow, never widen.
- **Reading a relation** is reading the relation member of the owner's row; then the target's own row rules apply to what it points at. `Link` and `Unlink` are writes to the relation member, told apart by whether the input's value gains or loses refs.
- **Attachment is metadata** under one `Metadata.key`: `Entity.same` holds, an interpreter that does not know the key ignores it, attaching twice appends to a surface's disjunction and replaces its deny, and the key's `summarize` prints `Read: isOwner | inProject | isAdmin → not_found`.

### 3.3 Row guards and the placeholder principal

`guard.row(E, body)` checks the body against `E` where it is written, as `Query.where` refuses a foreign field. The `p` the body receives is a **placeholder record**, not a value: one `Expr.input` per field of the principal's schema, named by the field (`p.id` is the input `principal.id`) and carrying its codec. The body is built once, so branching on `p.role` is a type error (a placeholder is an `InputExpr`, not a string), which is Hasura's session-variable discipline enforced by the type rather than remembered.

A row guard is written over `User`, never over the `Option`: a visitor never reaches one. A surface whose disjunction holds only row guards fails for a visitor before any row is read, and the usual spelling puts `signedIn` in `always`. This keeps `Expr.eq`'s rule that a nullable operand against a non-nullable field is an error where written, and reads as what it means.

### 3.4 What a guard sees

Cedar's four, mapped:

```text
principal    Option<User>, from G.Principal (a Context tag the server's authentication provides)
action       the Interaction being attempted
resource     the surface, and for a row guard the row: an existing one, the proposed values
             of a new one, or both for an update (§4)
context      Effect services through R; the Clock for time; nothing else
```

A principal guard body is `(principal: Option<User>, about: { interaction, surface }) => boolean | { allowed: false; reason: string } | Effect<…, never, R>`, so one `isAdmin` serves every surface, and a body that needs a membership service names it in `R`, which flows onto the Source as `read`'s `R` already does. Time comes from Effect's `Clock`, never `Date.now`, so "published before now" is testable under `TestClock`. Tenant is in the principal, not the context.

The decision type is Sync's existing `boolean | { allowed: false; reason }`, so a guard body and a Sync `authorize` rule read the same.

### 3.5 Deny, per surface

| Surface | Admits | Default | Why |
| --- | --- | --- | --- |
| row · Read | `not_found` only | `not_found` | existence must not leak; the server already settles without a read when every field is withheld |
| member · Read | `omit`, `redact(value)` | `omit` | `omit` is today's settled field, read as `Unavailable`; `redact` is ZenStack's and Hasura's masked column |
| relation · Read | `omit` | `omit` | a hidden relation reads as an empty list or a `null` ref, as `visible` does today |
| any write | `forbidden`, `explain(reason)` | `forbidden` | `explain` carries a sentence to the refused caller, as Sync's rejection does |

`forbidden` carries no reason, so a probing client learns only "no". `explain` is for the application's own users: "Only an editor may publish."

### 3.6 The default

An Entity with **no** guards stays open: that is today, and adoption must be additive. Once an Entity has any guard, a surface with no entry is a decision the author did not make. `declare` takes `unguarded: 'allow' | 'deny'` (default `'allow'`, for compatibility); the matrix prints `open` for every surface that falls to it; `validate` reports open surfaces on a guarded Entity when the default is `allow`. That gives Hasura's and ZenStack's safety without a hidden flip of existing behaviour.

---

## 4. Placement: decided at registration

| Guard | Surface | Runs | When it cannot |
| --- | --- | --- | --- |
| principal | any | before the read, inside `authorize`; before the write | — |
| row | row · Read, and every query over the Entity | compiled into the binding's `visible`; `evaluate` in `RemoteServer.memory` | **`Guards.binding` throws at registration**, naming the guard and the operator, as an unsupported query body does |
| row | member · Read | after the read, per fetched row, with `evaluate` | — : rows are already bounded by id, so a per-row field filter is exact |
| row | Create | before the write, with `evaluate` over the proposed values (presets applied, §6.4) | a field the guard reads that the input leaves unset: `forbidden` |
| row | Update | before the write over the row read under `visible` (RLS `USING`), and over the row as it would be after it (RLS `WITH CHECK`, ZenStack `future()`) | the row is hidden: `forbidden`, not `not_found`, since the caller named the id |
| row | Delete | before the write, over the row read under `visible` | the same |
| inherit | row · Read | a correlated subquery over the target's `visible` (§6.1) | the relation is not `one`, or the target has no row rules: throw |

Three conclusions are load-bearing. **Post-filtering is unsafe for membership and safe for fields:** a row guard on the row's `Read` is only ever SQL (or `memory`'s whole-table `evaluate`), while a row guard on a member runs over records the query already bounded. **An update is checked on both sides:** before, so a hidden row cannot be written; after, so a write cannot move a row out of what its writer may update (reassigning `ownerId` away from oneself is refused unless the `Update` disjunction still holds afterwards, which `isAdmin` does). **A placement failure is a definition-time error:** gen2 emits `authz:list-policy-not-placeable`; here the same fact throws from `Guards.binding`, as every other unsupported body does.

---

## 5. Reading them out, per seam

### 5.1 Reads: `foldkit-remote-server`

```ts
RemoteServer.entity(Todo, { read, ...Guards.source(Todo, Policy) })
```

`Guards.source(E, Policy)` yields `{ authorize, filter, derived }`:

- `authorize(principal, fields, about)` runs `always`, the row's principal `Read` guards (all fail: no fields, so the id is settled unread and looks absent) and each requested member's principal `Read` guards. Today's `authorize` takes `(principal, fields)` and returns fields synchronously; it gains `about` and may return an `Effect` with `R`.
- `filter(principal, record)` is **new on `EntitySource`**, run after `source.read`: it evaluates each member's row `Read` guards over the record and settles (`omit`) or replaces (`redact`). Skipped when no member has a row guard, so an unguarded Entity costs nothing.
- `derived` supplies `may` (§7).

Row `Read` row-guards are not applied here; the Source's own read must honour them (`memory` through `evaluate`, Drizzle through `visible`). `Guards.source` records which guards it expects placed, and `RemoteServer.validate` checks a Source for a guarded Entity was built from a binding that placed them (§5.2), so a hand-written Source over a guarded Entity is a startup error, not a silent hole.

### 5.2 Rows: `foldkit-remote-drizzle`

```ts
const Db = bind(Domain, { Todo: { table: todos, ...Guards.binding(Todo) } })
```

`Guards.binding(E)` yields `{ visible, policies }`: `visible(principal)` is `always` and the row `Read` guards compiled with the binding's `compileWhere`, placeholders bound from the principal at request time, plus an `inherit`'s correlated subquery; `policies` are the relations' `Read` row guards, one SQL predicate per collection, as `source(…, { policies })` takes today. The binding records what it placed, which §5.1's validation reads. `Visible`, today `(principal: unknown) => SQL | undefined`, becomes `Visible<P>`, and the CMS's `principal as P` casts go.

A query over the Entity is conjoined with `visible` already, so a body never widens what a principal may see. That holds for the row log too: `examples/cloudflare`'s live poll treats a logged row the subscriber can read as a member of its list, and "can read" is a read under `visible`.

### 5.3 Writes: declared writes and handlers

A **declared write** (`Mutation.write(name, Write.update(input, { id: 'id' }))`, served by `RemoteServer.write(M, writer(binding))`) already says, as data, which Entity, which row (its key) and which command (`insert`, `update`, `delete`). So `writer` checks it with nothing to wire: for a binding of a guarded Entity, it runs the plan below before it writes, and the declared write stays a write with no handler. A server that does not use guards sees no change.

A **handler** (`RemoteServer.mutation(M, run)`) writes what its code writes, so it is checked by wrapping it, from its `Entity.input`:

```ts
const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: TodoId }, Output: { id: TodoId } })

RemoteServer.mutation(ArchiveTodo, Guards.guarded(Policy, Archive, ({ input, principal, row }) =>
  Effect.gen(function* () { /* write; `row` is the Todo as read under visible */ }),
))
```

The plan, the same for both:

1. **`always`, then the row's guards for the command (or the named interaction).** An input that names an existing id: the row is read under `visible` and the guards run over it; a hidden row is `forbidden`. An `Update` runs them again over the row as it would be after the write (§4). An input with no id (`Create`): the guards run with `evaluate` over the proposed values after presets (§6.4); a field a guard reads that is unset is `forbidden`.
2. **Each mapped member's `Update` (or `Create`) guards.** `Entity.unmapped` keys are about the operation and are not checked.
3. **Each mapped relation's `Link` or `Unlink` guards**, by whether the value adds or removes refs against the row from step 1.

A refusal is a `RemoteServerError` of tag `Forbidden`, with `reason` only when the deny is `explain`. The write never runs. A handler whose input maps a guarded member but is registered without `guarded` is gen2's "generated input overpermits field"; `RemoteServer.validate` already walks mutations and gains this check.

**The answer is read back under the writer's `visible`.** A declared write answers with the row as written; a guarded one answers with the row as its writer may now see it, and a row the write moved out of the writer's sight is answered in `deleted` for that writer. §7a is why: the client places what an answer says, and an answer that showed a row its writer can no longer read would be placed into lists the server would not list it in.

`Crud.editor` gets its create/edit distinction from this: one mutation serves both when its input admits an optional `id`, and the plan branches on its presence.

### 5.4 Agents: `foldkit-agent`

```ts
Agent.expose(Message, {
  RequestedArchive: Guards.variant(G, Todo, Archive, {
    description: 'Archive a todo',
    input: Schema.Struct({ id: TodoId }),
    toMessage: ({ id }) => ({ id }),
    row: ({ id }) => Data.get(TodoRow, id),
  }),
})
```

On the client there are no bodies, so `Guards.variant` reads `may` from the row's Model copy when `Ready`, else refuses as unavailable. It is a gate for the agent's benefit, never the trust boundary: the Message's mutation is checked again on the server. `Agent.forApplication(App).withPrincipal<P>()` takes `P` from `G`.

### 5.5 Sync and the CMS

Sync's `authorize` per durable variant stays for documents Sync owns outright; for `foldkit-sync/entity`'s cell edits to Entity rows it is derived from the guards, and a document becomes one audience (§8c). The CMS is re-expressed in §8.

---

## 6. Relationships, identity, and presets

### 6.1 Inherit through a relation

Most real rules are relational: a Todo is readable by whoever may read its Project; a Comment by whoever may read its Post. `Expr` has no `exists` or join. Two answers need no new operator in the user IR:

```ts
Guards.attach(G, {
  row: { Read: [Guards.inherit('project')] },   // this row's Read is its Project's Read
})
```

The Drizzle binding compiles `inherit` as a correlated subquery over the target's `visible`, which it can emit because it knows both tables; `memory` follows the ref and evaluates the target's rules. It composes: a Comment inherits from its Post, which inherits from its Site. Zanzibar's `parent->viewer`. `inherit` is allowed on `one` relations only, a type error otherwise; a target with no row rules is refused by `Guards.binding`, since at `attach` the target may not have its guards yet.

### 6.2 Memberships as claims

Group membership resolved at authentication rides in the principal: `projectIds` in `User`, and `Expr.in(Todo.fields.projectId, p.projectIds)` in a row guard. `Expr.in` is the first new operator worth adding: one SQL form, one `evaluate` case, one conformance row, a `Query.placement` that holds (it filters, it does not order). It is what queries want too, and the Remote plan's deferred `Expr` growth lists it.

### 6.3 What waits for `exists`

A membership with a role on it, or a many-to-many through table checked per row, needs `exists` over a relation path. `Guards.binding` refuses such a rule by name until the data-query design's Phase 13 lands; the long-run shape is Hasura's nested boolean over a relation.

### 6.4 Presets

A client should not choose its own `ownerId`. A new `Entity.input` mapping kind sets a member from the principal on the server and refuses it from the client:

```ts
Entity.input(TodoFields, CreateTodoInput, { ownerId: Guards.fromPrincipal(p => p.id) })
```

`selectFor` and `valuesFor` skip it as they skip `unmapped`; the write plan applies it before evaluating row guards over the proposed values. Hasura's column preset, ZenStack's `@default(auth().id)`. A declared write with a preset is still a declared write: `writer` applies the preset from `G.Principal`.

### 6.5 Who is asking: one tag, one key

`RemoteServer.handlers(server, principal)` closes over a value today, so a handler set is built per request, and the live hub shares reads only between subscribers whose principal is the same object. `G.Principal` is a `Context.Tag<Option<User>>` that `handlers` and the hub read at request time, and `declare`'s `key` names a principal for grouping, so two requests by one person share a hub read. Effect HTTP middleware provides the tag from a cookie or bearer token; authentication stays there, and RemoteServer still reads no header.

On the client nothing changes on the wire: cookies ride on `Remote.http` already. A sign-in or sign-out is `Data.forget`, which drops every cached row and every `may`, since both are per principal.

---

## 7. The client's hint: `may`

The client needs to grey out a button for the reason the server would refuse it, and must not run the rule itself: it has no bodies, its row may be stale, and it is not the trust boundary. ZenStack's `check()`, gen2's `ui.hint`. The mechanism exists: a **derived member** the server supplies.

`Guards.attach` adds a derived member to the Entity: `may`, a `Struct` of one boolean per interaction the row has guards for, and per member or relation with `Update`, `Link` or `Unlink` guards. A Selection names what it wants:

```ts
const TodoRow = Entity.select(Todo, {
  title: true,
  may: Guards.may([Archive, 'Update', 'Delete'], { members: ['notes', 'ownerId'] }),
})
```

A Source from `Guards.source` answers it under the principal from the row it just read. A hand-written Source that omits it settles it: the client reads `Unavailable`, Crud reads "not yet known". The answer is exact for the principal and row at the moment of the read, and it is data in the Model, so it is `Refreshing` or stale exactly as the row is.

Consumers: `Crud.editor`'s `may(model, Archive)` and `readonly(model, 'ownerId')`, so `foldkit-mixins-form` draws a disabled field; a list's per-row actions; `Guards.variant` for agents.

`may` is not an `Expr`: its answer depends on principal guards, whose bodies never ship. The Remote plan's Phase 12 "derived members as expressions" applies to derived members computed from the row; `may` is the case it names as server-only.

---

## 7a. Client placement, caches and live lists under guards

Remote places rows itself: a mutation's answer, a read or a live patch moves a held row in the lists that hold it, and an inserted row is drawn where a list's body orders it (remote-improvement-plan §16, Phases 7–11). That reasoning judges a row against the list's **body**. Under guards, the server lists `body ∧ visible(principal)`, and the client has the body only. Placement stays sound by three rules, none of which runs a guard on the client.

1. **An answer shows only what its writer may see.** §5.3's read-back under `visible` means every row an answer carries is one its writer may read, and a row a write hid from its writer arrives in `deleted`. The client tombstones it, and it leaves every list through the tombstone, as a deletion does today. Reads and live patches already come through `visible`, so news needs no change.

2. **A change to a guard field is not judged by the client.** `Guards.guardFields(E)` is the set of fields any row `Read` guard of `E` reads (`always` and `inherit`'s foreign key included). Remote's impact treats a change to one, on a row a list does not hold, as a membership it cannot judge: the list is invalidated, as for a row lacking a field its body reads, instead of being placed. Rule 1 covers the writer's own sight of a row it holds; this rule covers a row joining a list on the strength of a field the server filters on. It is read from the Entity's metadata, so impact needs no change of shape: guard fields join the body's predicate fields with the answer "unknown".

3. **Caches are per principal.** A persisted snapshot (`Data.persistence`) is scoped by `declare`'s `key`, as `examples/cloudflare` scopes by actor already, and `Data.forget` runs on a principal change. A snapshot written under one principal never paints for another.

`verifyPlacement` keeps checking: in development and tests, every list a placement moved is fetched again, now under the principal that placed it, and a disagreement is recorded. Rule 2 is the conservative half of Phase 12's "row policies joined to every query"; the precise half, evaluating row guards on the client with the principal's values bound (they are `Expr`, so data the client has), is §13's question 6 and waits for a list rule 2 measurably refetches.

---

## 8. The CMS, re-expressed

`foldkit-cms-drizzle` already enforces an audience boundary across every read path, by hand: `published(column, isAuthor)`, `authorsOnly` for its tables, `isAuthor` before every operation, `allow(principal, transition, entry)`, and a `principal as P` cast where `Visible` is untyped.

```ts
const PostFields = Entity.define('Post', PostStruct)

const G = Guards.declare('Cms', Author, guard => ({
  isAuthor: guard.principal(),
  isEditor: guard.principal(),
  isPublished: guard.row(PostFields, () => Expr.isNotNull(PostFields.fields.publishedAt)),
}), { key: author => author.id })

export const Post = PostFields.pipe(Guards.attach(G, { row: { Read: [G.isPublished, G.isAuthor] } }))

const cms = CmsServer.make({
  …,
  guards: G.implement({
    isAuthor: Option.isSome,
    isEditor: principal => Option.exists(principal, author => author.role === 'editor'),
  }),
  transitions: { publish: [G.isEditor], schedule: [G.isEditor], unpublish: [G.isEditor] },
})
```

`CmsServer.make` attaches `Read: [isAuthor]` to its Entry, Draft and Revision Entities, `Write: [isAuthor]` to its operations, and the transition interactions to the entry row; `cms.sources` come from `Guards.source`. Its startup check "a published type whose binding shows every row" becomes "its Entity has no row `Read` guard", the same fact read from metadata. `allow` stays as an escape hatch for a rule about the entry's own state. The worklist (`CmsEntries`) is author-only, so rule 2 of §7a never fires for it; a public list of posts is `isPublished ∨ isAuthor`, and a post an author unpublishes is a change to a guard field.

---

## 8a. Routing

The router design stacks four layers (Catalog, CMS audience, RemoteServer authorization, SSR coverage) and says the sentence this note builds on: *that boundary is stronger than doing auth in a router guard*, and *`when` is presentation, not authorization*. Guards are that boundary made declarative, so routing changes nothing and gains three things.

- **Routes carry no authorization.** A route resolves to active Surfaces; the Surfaces read Entities; the guards govern the reads. A visitor on `/admin/todos/7` gets `NotFound` from the row rule, not a router 403, and the page draws its not-found state. Existence does not leak, which a route-level check cannot promise.
- **SSR and `Data.satisfy` run as the visitor.** The server render builds its `RemoteClient` from `handlers`, which reads `G.Principal`, provided from the request's cookie by the same middleware as every other request. The resume plan ships exactly what this principal may see, `may` included, so the first paint has the right controls and no flash. Hover prefetch runs under the client's own cookie.
- **`Me`: the visitor as an Entity.** "Show a sign-in page rather than a 404" and "show the Admin link" are knowledge about the visitor, not about a row. Declare a `Me` Entity with one row per principal and route-level interactions on it (`OpenAdmin`, `Publish`), read once with `Guards.may`. Navigation metadata (router 34.4's one annotated graph) derives link visibility from `Me.may`, `Surface.when` gates presentation on it, and no guard body runs on the client. `Me` also replaces the "current user" shape every application invents, and `Data.forget` on sign-out drops it with everything else.

## 8b. Agents

The adapters already model the pieces by other names. `agent-mcp`'s HTTP handler has `authenticate(request)` returning a Principal, `createAgent({ principal, sessionId })` so no two principals share a runtime, and `principalId` for a stable key: these become `G.Principal`, one runtime per principal, and `declare`'s `key`, so the agent's `P` and Remote's `P` are one type instead of two inferred ones.

- **Dispatch order stays**: resolve, `available`, decode, `authorize`, dispatch. `Guards.variant` fills `authorize` in one of two modes by what it is given. On the client (WebMCP, Agent Native) there are no bodies: `Guards.variant(G, ...)` reads `may` from the row's Model copy and refuses as unavailable when it is not `Ready`. On a server-hosted runtime (MCP over HTTP, A2A): `Guards.variant(Policy, ...)` has the bodies and evaluates row guards over the Model row. The type decides, and a client bundle cannot name a `Policy`.
- **`available` gets a real source.** WebMCP reconciles its tool list as `available(model)` changes. A variant given a row sets `available` from `may`, so a visitor's tool list does not contain `archive_todo` at all. The Model already holds that answer, so nothing new leaks.
- **Resources inherit the boundary transitively.** `Agent.resource` reads the Model, and the Model holds only what the server let this principal see. A resource over local Model state was never governed and is not now.
- **Audit and manifest cross-reference.** A refusal is already an `AgentAuthorizationError`; the audit entry gains the failing guard's name, never shown to the caller unless the deny is `explain`. `Agent.toManifest` names the guards per capability, and the matrix names the capabilities per guard; both are committed data.
- **The chain holds end to end.** A server-hosted agent dispatches into a host runtime whose `RemoteClient` is bound to the session's principal, so the Message's mutation is checked by the server under the same identity the agent authorized.

## 8c. Sync, Durable, presence

Sync authorizes writes per durable variant inside the journal's commit, against the authoritative snapshot, and refuses at connection level with `refuse`. `foldkit-sync/entity` makes guards unavoidable there: a cell edit `{ id, member, value }` is a **write to a member of a server-owned Entity row** through the journal instead of a Remote mutation. Ungoverned, it is a second write path around the guards, the "one rule on one path leaves three open" failure. The registry example is that path today: its journal validates that an edited row exists, and `applyEdits(Db.Product, { live })` lands each committed edit, with no authorization on either.

**Writes, in two halves by where each check can run.**

- Principal guards, `always`, and the changed members' `Update` guards run inside the journal's `authorize`: it holds the write lock and must stay local to the snapshot, and these need only the principal and the change. `Guards.journal(G, Policy, { EditedProducts: changes => ... })` derives that `authorize` from the edit Message.
- Row guards need the row, which lives in the table, not the snapshot, so they cannot run under the lock. They run in the exchange before `append`, as a `refuse` that becomes an `Effect` returning the common decision type, reading the row under `visible`. A hidden row refuses `forbidden`. `journalExchange` and `serveJournal` stay the one hand-written exchange.

**Reads: a Sync document is one audience.** Committed operations go to every replica that may open the document, and a cell edit carries the member's value. An edit to a member a visitor may not read, replicated in a document a visitor may open, leaks the value while Remote withholds the row. Guards on the Entity cannot help, because Sync never reads them. The rule that closes it compares guard identities and needs no evaluator:

- A document declares who may open it: `Guards.document(G, { readers: [G.isAuthor] })`, enforced as a connection-level `refuse` for a principal that fails it, and governing the presence channel that accompanies it.
- `EditableEntity.make` over a guarded Entity requires that every edited member has **no member `Read` guard**, and that each of the document's `readers` **appears in the Entity's row `Read` disjunction**. Then every reader may read every row, and nothing the edits carry is hidden from anyone who receives them. A document over a Read-guarded Entity without `readers` is refused at definition.

Per-member or per-row secrecy *within* a document is not something a replicated log offers; the package says so at `make` rather than letting it be discovered. `RemoteEdits`, which shows a replica's pending edits as Remote overlays, needs nothing: it overlays rows the replica could already read.

**Durable** keeps `authorize`, `validate` and `actorId(principal)` as they are; it is a document log and learns nothing about Entities. `journalExchange({ principal })` takes `G.Principal`. The commit stamp's `by.actor`, shown to other replicas, is a display name resolved as the CMS's `nameOf` is, never the principal's key.

**Presence** is ephemeral broadcast, validated by `decodeValue`, scoped by the document's `readers`. Its values are application-chosen and must not carry guarded fields; that is the author's responsibility, as `decodeValue` already is. A peer's `id` on the channel should be stamped by the server from `G.Principal` and `key`, not declared by the peer, as the commit stamp already does for edits; whether the server side does this today was not traced for this note and is the first thing the Sync slice checks.

---

## 9. Failure and denial, end to end

| Cause | Server | Wire | Client |
| --- | --- | --- | --- |
| member Read refused, `omit` | field settled, unread | in `settled` | `Failed`, `error._tag: 'Unavailable'`; not planned again |
| member Read refused, `redact` | value replaced | in `entities` | `Ready` with the replacement; indistinguishable by design |
| row Read refused | not returned, not settled | absent | tombstone, `NotFound` |
| write moved a row out of its writer's sight | row read back under `visible`, absent | in the answer's `deleted` | tombstone; leaves every list it was in, with no request |
| write refused, `forbidden` | `RemoteServerError` `Forbidden` | `RemoteMutationError` `_tag: 'Forbidden'`; HTTP 403 from `answer` | `MutationFailed`; `Data.mutation` `Failed` with a `Forbidden` error |
| write refused, `explain` | the same, with `reason` | the same | the reason, for the user who asked |
| a guard field changed on a row a list does not hold | — | — | the list is invalidated and fetched again (§7a, rule 2) |
| agent variant refused | — | — | `AgentAuthorizationError`, audited as `refused` |

The new wire facts are the `Forbidden` tag and its optional `reason`. `Remote.http` learns to keep the status it drops today.

---

## 10. What the existing packages change

1. **`foldkit-entity`.** `Expr.in`, with its `evaluate` case, its conformance row and `Query.placement`; a `fromPrincipal` mapping kind in `Entity.input`, skipped by `selectFor` and `valuesFor`.
2. **`foldkit-remote-server`.** `EntitySource.authorize` takes `about` and may return an `Effect` with `R`; `EntitySource.filter?` added and run after `read`; `RemoteServerError` gains `Forbidden`; `answer` maps it to 403; `validate` checks guarded Entities have placed Sources, declared guards are implemented, guarded inputs have `guarded` handlers, and reports open surfaces under `unguarded: 'allow'`; `handlers` and `liveHub` read `G.Principal` and group by `key`; `RemoteServer.memory` applies row `Read` guards with `evaluate` and runs `filter`; `RemoteServer.write` runs a guarded writer's plan.
3. **`foldkit-remote-drizzle`.** `Visible<P>`; `bind` carries `P`; a binding records what it placed; `inherit` compiles to a correlated subquery; `Expr.in` compiles; `writer` checks a guarded Entity's declared writes and reads its answer back under `visible`.
4. **`foldkit-remote`.** `RemoteMutationError` gains `Forbidden` and `reason`; `Remote.http` keeps the status; `Data.mutation`'s `Failed` exposes the tag; impact reads `Guards.guardFields` from the Entity's metadata (§7a, rule 2); `Data.persistence` documents the per-principal scope.
5. **`foldkit-crud`.** `may` and `readonly` from the derived member; create/edit branch on the input's optional `id`.
6. **`foldkit-agent`.** `withPrincipal<P>()` inferred from `G`; `Guards.variant`.
7. **`foldkit-cms-drizzle`.** §8; the casts removed.
8. **`foldkit-sync`.** `Guards.document` as a connection-level refuse on exchange; `Guards.journal` deriving a journal's `authorize` from an edit Message's changes; `JournalExchangeOptions.refuse` may return an `Effect` of the common decision type, run before `append`; `EditableEntity.make` checks the document's `readers` against the Entity's guards; `journalExchange({ principal })` reads `G.Principal`; the presence server stamps a peer's id from the connection if it does not already.
9. **`foldkit-agent-mcp`.** `authenticate` provides `G.Principal`; `principalId` defaults to `declare`'s `key`.

Impact's guard fields are the one place the client package reads guard metadata. It reads a field list, never a guard, so `foldkit-remote` gains no dependency on `foldkit-guard`: the metadata key lives in `foldkit-entity`, as `Collation`'s does.

---

## 11. What this deliberately does not do

- **No client-side rule evaluation.** `may` is the server's answer, and a change the client cannot judge under the guards is fetched (§7a). Instant local hints over row guards (which are data on the client) are a later addition; gen2's "sound-allow / sound-deny / best-effort" is the vocabulary for that day.
- **No roles as a built-in.** A role is whatever `User` says; `isAdmin` is one line of `implement`.
- **One new operator**, `Expr.in`. `exists` waits for the data-query Phase 13, and `inherit` covers the `one`-relation case without it.
- **No negation.** gen2 defers `not` for SQL placement until null semantics are settled; `isNull`/`isNotNull` cover absence.
- **No second evaluator.** Row guards are `Expr`, run by the two evaluators the conformance suite keeps in agreement.
- **No secrecy within a Sync document.** A document is one audience (§8c); per-row or per-member hiding inside a replicated log is refused at definition, not approximated.
- **No transaction of its own.** A guarded write's check and its statement run in the driver's own transaction where the write is several statements; remote-drizzle's README says which form each driver takes.
- **Authentication is the application's.** Sessions, cookies, tokens, accounts. The seam is `G.Principal`.

---

## 12. Build order

Each slice stands alone, is committed with its tests, and is reviewed before the next.

1. **`Expr.in`** in `foldkit-entity`: its `evaluate` case, its conformance row, Drizzle compilation (SQLite and Postgres), `Query.placement`. First because the core's examples and every membership rule need it, and queries want it on its own. *Built:* SQL's `in` throughout, a null in the list included (the evaluator is checked against SQLite's own `in`); an empty list compiles to `false`, since Postgres refuses `in ()`; TanStack's interpreter runs it too, settling an empty list itself.
2. **`foldkit-guard` core.** `declare` (curried, with `key`, `unguarded`), `principal`, `row` with the placeholder record, `all`, `inherit`, `on`/`redact`/`explain`, `Interaction.make`, `attach` (metadata key, the `may` derived member), `implement`, `guardFields`, `matrix`. Pure. Tests: `types.test-d.ts` with `@ts-expect-error` for a foreign member key, a foreign Entity's row guard, a guard from another set, a branching placeholder, a mistyped redact, a missing or extra `implement` key, one defect per negative case; `evaluate` over a row with the principal bound; merge of two attachments; the matrix read back from a snapshot. *Built,* but `may`, which moves to slice 7: it adds a derived member, changing the Entity's type, and nothing answers it before `Guards.source`. A guard's type carries its set's name, so another set's guard over the same principal is a type error, not only one over another principal (an inference that took the set's name from the config too had let it through). A member's `Update` governs its `Create` unless the member names one (§13 question 8, settled). `inherit`'s check that the target has row rules moves to `Guards.binding`: at `attach` the target may not have its guards yet, as relations point both ways.
3. **Reads, and §7a.** `Guards.source` and `Guards.binding`; `EntitySource.filter`; `inherit`'s subquery; the placement throw; `memory` honouring row guards; `validate`'s placed-and-implemented checks; impact's guard fields. Kitchen-sink test: one Todo read as owner, project member, admin and visitor, by id, through a relation, through a query, through `memory` and SQLite; asserting `NotFound`, `Unavailable`, a redacted value, an inherited read, the hub re-reading under each subscriber's own principal, and a list invalidated, not placed, when a row's `ownerId` changes under it. Mutation-test by deleting the `visible` conjunction, the per-row filter, `always`, and the guard fields in impact.
4. **`G.Principal` and `key`.** `handlers` and the hub read the tag; a test that two requests by one person share a hub read; persistence scoped by `key`.
5. **`Forbidden` end to end.** Server error, `answer` 403, `Remote.http` status, client tag, `Data.mutation`.
6. **Writes.** `writer`'s plan for declared writes; `fromPrincipal`; `Guards.guarded` for handlers; the read-back under `visible` and `deleted` for a hidden row; `validate`'s overpermits check. Tests: create with a guard over an unset field, create with a preset, update of a hidden row, an update that would move a row out of its writer's `Update` (refused) and one that moves it out of the writer's `Read` (answered as `deleted`, and the row leaves the client's lists), delete, link and unlink, `explain`'s reason reaching the client.
7. **`may`.** Served by `Guards.source`; Crud's `may` and `readonly`; `mixins-form` disabled fields; `Data.forget` dropping it.
8. **Agent.** `Guards.variant`; `withPrincipal` inferred.
9. **CMS.** §8; the casts removed; the example's `isAuthor`/`allow` rewritten; the e2e audience test unchanged and green.
10. **Sync.** §8c: `Guards.document` as a connection-level refuse; `Guards.journal` deriving the journal's `authorize`; an Effect-returning `refuse` with a reason for row guards before `append`; `EditableEntity.make`'s audience check; the registry example's edits governed by `Product`'s guards. First, read the presence server to confirm whether a peer's id is stamped from the connection. Tests: a visitor's exchange refused by `readers`; an edit to an `Update`-guarded member rejected with its reason; a document declared over a member with a `Read` guard refused at `make`.
11. **Docs.** `packages/guard/README.md` in the onboarding order; a `SKILL.md` row and `references/guard.md`; `remote.md`'s authorization gotchas pointing here; `CHANGELOG.md` per slice.

The Remote plan's Phase 12 gate ("an application that needs placement in a list under row-level authorization") is met by slice 3's kitchen-sink Todo and by slice 9's public post list; §7a's rule 2 is what Phase 12 builds first.

---

## 13. Open questions

1. **Should `Guards.row`'s placeholder be the only way to reference the principal in an `Expr`,** or should a hand-written `Expr.input('principal.id', …)` also be recognised by `Guards.binding`? Leaning: placeholder only; a hand-written input name is a string the type cannot check.
2. **Does `redact` belong in the first slice?** It is the only deny the client cannot tell from a real value. It is in because the alternative is a second Selection per role.
3. **A row guard on a `supplied` derived member** has no row value until the application supplies it. Leaning: `attach` refuses it.
4. **Should the committed matrix be a check?** `validate` comparing a committed matrix against the live one catches an unreviewed access change at startup. Cheap once the matrix exists; not in the core slice.
5. **Should `unguarded` default to `'deny'` for a guarded Entity** once the package has been used in anger? Hasura and ZenStack say yes. Revisit after the CMS re-expression shows how many surfaces fall to the default.
6. **Client-side evaluation of row guards**, for placement (§7a, rule 2's precise half) and for instant hints: they are data on the client already, and the principal's values would have to ride to the client, which a `Me` row could carry. Deferred until rule 2 measurably refetches somewhere real, or `may` proves insufficient.
7. **Is the read-back under `visible` (§5.3) one extra read per guarded write worth it,** or should a write that cannot change a guard field skip it? Leaning: skip when the write touches no field in `guardFields`, which is the common case and decidable from the `Write`.
8. **Per-command interactions**: should a member's `Update` guard also govern `Create`, as `Write` does for rows? *Settled in slice 2:* yes, unless the member names a `Create`, since a member a client may not change is rarely one it may set freely on creation.
