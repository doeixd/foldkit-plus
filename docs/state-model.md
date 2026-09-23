# Who changes application state, and how

Four questions answer every state change in a Foldkit Plus application:

1. **Who owns this datum?** The one authority for it.
2. **Who may observe it?** Readers never own.
3. **What causes it to change?** A transition or an installation.
4. **Who may structurally install a value?** Only infrastructure, through a
   declared seam.

## The two write paths

Ordinary application changes travel `Message → update → modifyFields`:

```text
user / agent / behavior / external fact
        │
        ▼
     Message
        │
        ▼
      update
        │
        ▼
   modifyFields
        │
        ▼
    next Model
```

Infrastructure installs already-derived values through structural seams:

```text
checkpoint / URL / cache result / reconciliation
        │
        ▼
 ModelRef / WritableProjection
        │
   set / modify
        │
        ▼
    next Model
```

`ModelRef.modify` is focused structural replacement — `set` of a function
applied to `get` — not a transition mechanism. It delegates through the
ref's own `set`, so container-aware `.at`/`.index` insertion keeps working.

## The matrix

| Situation | Owner | Change mechanism |
| --- | --- | --- |
| Local UI/domain state | application | Message → update → `modifyFields` |
| Submodel state | Submodel | child Message → child update → `modifyFields` |
| Server fact | server | Remote Message → `Data.reduce` |
| Replicated user operation | application/durable history | Message → application update → `modifyFields` |
| Sync checkpoint | authoritative replica | `WritableProjection.set` |
| URL/KV restoration | local application | Mirror → `WritableProjection.set` |
| Agent action | application | Agent → Message → update |
| UI behavior | application | Behavior → Message → update |

## What a reader sees while a change is in flight

Remote and Sync both let a change show before its authority has agreed to it,
and they do it by different mechanisms — optimistic layers over a cache, and
durable operations replayed over a replica. The shape underneath is the same,
so they use the same four words:

```text
confirmed / committed        the authority's own last word
        +
pending                      the changes asked for and not yet answered
        =
visible                      what a view draws
```

| Word | Remote | Sync |
| --- | --- | --- |
| The authority's last word | `Data.confirmed(projection)` | `mounted.committed` |
| Asked for, not yet answered | optimistic layers and connection overlays | durable operations not yet exchanged |
| What a view draws | the projection itself | the replica's shared slice |
| Answered, either way | `settled` — the mutation applied or failed | the exchange rebased the operation |

Two rules follow, and they are the reason the words are worth keeping straight:

**A view wants the visible read.** That is why it is the plain one in both
packages: a projection is already visible, and the replica's slice is already
optimistic. Neither makes you ask for what you almost always want.

**A reporter wants the confirmed one.** Something that tells the world a change
happened must not believe it before the authority does. In practice that is an
Agent capability completing on state, which is why `Agent.when` takes either:

```ts
Agent.when({ projection: Data.confirmed(ProjectName), predicate })   // Remote
Agent.when({ source: mounted.committed, predicate })                 // Sync
```

Neither package generalises the other. There is deliberately no shared overlay
primitive: the algebra is shared, the mechanisms are not, and one implementation
forced over both would hide which authority a reader is actually waiting on.

## Semantic state is not runtime work

`RemoteData` says what the Model knows — `Initial`, `Loading`, `Ready`,
`Refreshing`, `Failed`, `NotFound`. It is application state: it is in the Model,
it replays, and a view renders from it.

Whether a fiber happens to be running is not. Runtime activity is real, and
devtools may want it, but it is not a second input to a view: a render that
depends on it is no longer reproducible from the Model, which is the property
every other rule here exists to protect.

This is also why there is no `action()` here. Foldkit already scopes an
optimistic write, its effect, and its reconciliation: `update` applies the
optimistic change and returns the Command, the Command does the work, and the
Message it returns reconciles. That is the same three phases, written in the
architecture that was already there.

## The rule

A setter is not unsafe — it is intentionally powerful infrastructure. What
matters is *authority*: Sync may install a checkpoint because that is the
job of its writable projection; a click handler must not use the same
mechanism to bypass application Message semantics. When reviewing code,
ask whether the write *causes* a transition or *installs* an already-decided
value, and require the matching path.
