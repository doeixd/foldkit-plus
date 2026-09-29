# `assembly.runtime`: a full-Model `initial` value (follow-up proposal)

> **Status:** proposal, not built. `assembly.runtime` shipped accepting
> `initial` rest or an init function returning `assembly.initial(...)`
> (single constructor). A parallel exploration accepted a full parent Model
> instead; this note records that idea, why it was not kept, and what would
> have to change for it to come back.

## The idea

```ts
placements.runtime({
  initial: fullModel, // the whole parent Model, children included
  update,
  ...
})
```

with `init: () => ({ model: fullModel })`. Callers holding a prebuilt Model —
an `initial()` helper returning one, a resumed page — would plug it in
directly, with no seed and no init function. A thunk form (`() => Model`)
adds laziness but takes no boot arguments, so anything the seed derives from
(the URL) still needs the function form.

## What it would take

Rest and a full Model are both objects, so the two value forms need a
disambiguation rule with an error on each side of it:

- Has every top-level placement field: a full Model.
- Has none: rest.
- Has some: neither — a tailored error naming both forms, complementing the
  rest-keys error (`initial rest is exactly the fields no placement owns`).

## Objections

1. **Dropped startup Commands are undetectable.** Wiring startup is guardable
   (`HasInit` can demand the `Wired` brand, as `runtime` does for its function
   form), but nothing statically signals that a *placement's* `init` emits
   Commands. A full-Model value silently drops them — including the child's
   own fetch on first paint. The parallel exploration carried exactly this
   hole for placements.
2. **Derived-args placements idle.** With no seed, factories never run: child
   slices must be hand-provided, and Subscription/resource records cannot be
   built (the underived-factory error already covers this). `update` still
   works through its per-use fallback, but that is a partial feature, not a
   supported combination.
3. **The gap is one arrow wide.** The function form already covers prebuilt
   Models — `initial: () => ({ model: prebuilt })` — everywhere except
   `HasInit`-gated assemblies, where dropping startup Commands is a bug and
   is correctly refused.

## Recommendation

Decline until a static signal for placement init Commands exists; revisit
then. If it ever comes back, it needs both confusion errors, the laziness
question settled (a value is eager; boot input cannot flow through it), and
docs stating that factories and startup Commands do not participate.
