# Who changes application state, and how

Four questions answer every state change in a Foldkit Plus application:

1. **Who owns this datum?** The one authority for it.
2. **Who may observe it?** Readers never own.
3. **What causes it to change?** A transition or an installation.
4. **Who may structurally install a value?** Only infrastructure, through a
   declared seam.

## The two write paths

Ordinary application changes travel `Message → update → evo`:

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
       evo
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
| Local UI/domain state | application | Message → update → `evo` |
| Submodel state | Submodel | child Message → child update → `evo` |
| Server fact | server | Remote Message → `Data.reduce` |
| Replicated user operation | application/durable history | Message → application update → `evo` |
| Sync checkpoint | authoritative replica | `WritableProjection.set` |
| URL/KV restoration | local application | Mirror → `WritableProjection.set` |
| Agent action | application | Agent → Message → update |
| UI behavior | application | Behavior → Message → update |

## The rule

A setter is not unsafe — it is intentionally powerful infrastructure. What
matters is *authority*: Sync may install a checkpoint because that is the
job of its writable projection; a click handler must not use the same
mechanism to bypass application Message semantics. When reviewing code,
ask whether the write *causes* a transition or *installs* an already-decided
value, and require the matching path.
