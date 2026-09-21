> **Status: done, bar one item that needs a decision rather than work.**
>
> This was a coherence pass rather than a feature, so "done" means the
> distinction it argues for is visible everywhere a reader would look. Audited
> item by item:
>
> | # | Item | State |
> | --- | --- | --- |
> | 1 | Codify the semantic-vs-structural rule | Done — `AGENTS.md` and the root `README.md` both state it |
> | 2 | Normalize examples around `evo` | Done — the last four application transitions still written as spreads (`examples/cms`, `examples/entity`) are converted; array spreads *inside* an `evo`, and store construction in demo helpers, are left alone as the item says |
> | 3 | `ModelRef.modify` | Done — `packages/surface/src`, delegating through the ref's own `set` |
> | 4 | No `Surface.evo` / `Projection.evo` / `Entity.evo` | Held — none exists |
> | 5 | Surface docs around the separate concepts | Done — the five-line table is in `packages/surface/README.md` |
> | 6 | "How state changes" per stateful package | Done — Remote, Sync and Mirror each carry one |
> | 7 | Agent and Mixins one-way toward Messages | Done |
> | 8 | Shared conceptual guide | Done — `docs/state-model.md`, with the matrix |
> | 9 | Root README diagram showing both write paths | Done |
> | 10 | Typechecked architecture examples | Done — `examples/todo-app/test/state-seams.test.ts` |
> | 11 | Tests for `ModelRef.modify` | Done — `packages/surface/test` |
> | 12 | A `prefer-evo-model-update` lint rule | **Not done, and it is not a small item.** |
>
> Item 12 reads as "consider a lint rule", and its own text says to consider it
> only once the convention is taught. The convention now is. But this repository
> has **no ESLint at all** — no config, no dependency, no `lint` script — so the
> item is not "add a rule" but "stand up linting for a 28-package monorepo and
> then add one rule to it". That is a different decision, with its own cost, and
> it should be made as one rather than arrived at sideways.
>
> Worth noting against it: the rule's own description is conservative to the
> point of being hard to write. Object spreading is correct for arbitrary value
> construction, Remote store internals and normalized records; the target is
> narrowly "rebuild the Foldkit Model merely to replace one or more fields". The
> audit above found **four** violations in the whole repository, all in two
> files. A linter earns its keep where a convention is violated often enough
> that review misses it, and the evidence here is that this one is not.

Yes. Based on the current code and docs, I’d make this a **coherence pass across Foldkit Plus**, not an “add `evo` everywhere” change.

The goal should be to make one distinction explicit throughout the ecosystem:

> **Application behavior:** `Message → update → evo → Model`
> **Infrastructure reconciliation:** `ModelRef / WritableProjection → set/modify → Model`

That matches Foldkit’s state-machine model while preserving why `foldkit-surface` has writable structural references in the first place. Surface’s setters exist for infrastructure such as Sync checkpoints and Mirror restoration; they should not become a second application transition API.

## Target architecture

I would establish this as a repo-level invariant:

```text
                           APPLICATION SEMANTICS

 User / Agent / Behavior / External Fact
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


                         INFRASTRUCTURE SEAM

 checkpoint / URL / cache result / reconciliation
                   │
                   ▼
          ModelRef / Projection
                   │
              set / modify
                   │
                   ▼
               next Model
```

Surface then sits orthogonally across both:

```text
Schema
  │
  ├── Model
  │    │
  │    ├── update / evo           semantic evolution
  │    │
  │    └── ModelRef / Projection  structural addressing
  │
  ├── Message
  │
  └── Surface
       ├── observation
       ├── capabilities
       ├── dependency metadata
       └── ownership metadata
```

This is particularly consistent with the existing documentation philosophy: the repo already says structural access or a setter is not automatically transition ownership, and that ownership/lifecycle should be taught before features.

## Implementation plan

1. **Codify the semantic-vs-structural rule first:** Add a short architectural section to `AGENTS.md` and the root `README.md`. The rule should be: ordinary application Model changes happen in `update`, normally using `evo`; `ModelRef.set` and `WritableProjection.set` are infrastructure/application-boundary mechanisms for installing an already-derived value. Explicitly warn against using `App.fields.foo.set(...)` as a convenient alternative to an application Message/update transition.

2. **Normalize all application examples around `evo`:** Search `examples/`, package READMEs, and conceptual docs for normal Foldkit updates using `{ ...model, field: ... }`. Convert application-owned transitions to `evo`, including nested updates with nested `evo`. The kitchen-sink example is an obvious first target: its Remote path correctly delegates to `Data.reduce`, but its local notes/selection reducer currently uses spreads.  This should become the canonical contrast:

   ```ts
   if (Remote.reduces(message))
     return { model: Data.reduce(model, message) }

   return {
     model: evo(model, {
       selectedNoteId: () => message.id,
     }),
   }
   ```

   Do **not** mechanically convert infrastructure internals such as `Projection.set`, Remote's submodel installation, Mirror restoration, or Sync checkpoint installation to `evo`.

3. **Add `ModelRef.modify` as the structural complement to `evo`:** This is the one API addition I think the research actually justifies. Today Remote effectively performs `store.set(model, updateRemote(store.get(model), message))`.  Give `ModelRef`:

   ```ts
   ref.modify(model, value => nextValue)
   ```

   with semantics equivalent to:

   ```ts
   ref.set(model, fn(ref.get(model)))
   ```

   Then internal submodel-oriented code can say:

   ```ts
   store.modify(model, remote =>
     updateRemote(remote, message)
   )
   ```

   This removes noisy get-transform-set choreography while retaining the crucial distinction from `evo`: `modify` is **focused structural replacement**, not a new transition mechanism.

4. **Do not add `Surface.evo`, `Projection.evo`, or `Entity.evo`:** Resist making every abstraction stateful. `Surface` is an observation/capability contract; `Projection` is a read/write structural description; `Entity` describes server-owned data; Agent exposes Messages; Mixins decorates views. Giving these their own evolution APIs would weaken the “one state machine” design that the root README currently emphasizes.

5. **Rewrite the Surface docs around three separate concepts:** The existing Optics/Submodel section is already close. Make the distinction even sharper:

   ```text
   evo               = evolve application data inside update
   Optic / ModelRef  = locate a value structurally
   Projection        = describe/read/write a known Model slice
   Surface           = observation + capability boundary
   Submodel          = transition ownership boundary
   ```

   Include one “same field, different purposes” example:

   ```ts
   // application transition
   evo(model, { filter: () => "active" })

   // structural addressing
   App.fields.filter.get(model)

   // infrastructure installation
   App.fields.filter.set(model, restoredFilter)
   ```

   Surface already explains that setters must not bypass a Submodel’s update; this would generalize that rule to the whole application.

6. **Make each stateful package explain where `evo` stops:** Add a small “How state changes” section to Remote, Sync, and Mirror. For Remote: local application state uses `evo`; Remote Messages go through `Data.reduce`; Remote owns its embedded submodel. For Sync: durable Messages replay the normal application `update`, so `evo` naturally participates in deterministic replay; reconciled/checkpoint state is structurally installed with `Projection.set`. Sync already derives replay from application `update` and verifies that durable Messages touch only the declared projection.  For Mirror: ordinary edits use Message/update/`evo`; URL/KV restoration is an infrastructure write via the declared writable projection. Mirror currently does exactly that.

7. **Make Agent and Mixins explicitly one-way toward Messages:** Their docs should show:

   ```text
   Agent capability ─┐
                     ├→ Message → update → evo
   Mixins Behavior ──┘
   ```

   Then explicitly state that neither an Agent nor a Behavior gets a Model setter. Agent already defines capabilities as existing Messages, while Mixins explicitly says it is not a state library.

8. **Introduce a shared “state ownership and writes” conceptual guide:** I’d add `docs/state-model.md` rather than repeat the full explanation in every README. It should answer four questions: “Who owns this datum?”, “Who may observe it?”, “What causes it to change?”, and “Who may structurally install a value?” Use a matrix like this:

| Situation                 | Owner                       | Change mechanism                     |
| ------------------------- | --------------------------- | ------------------------------------ |
| local UI/domain state     | application                 | Message → update → `evo`             |
| Submodel state            | Submodel                    | child Message → child update → `evo` |
| server fact               | server                      | Remote Message → `Data.reduce`       |
| replicated user operation | application/durable history | Message → application update → `evo` |
| Sync checkpoint           | authoritative replica       | `WritableProjection.set`             |
| URL/KV restoration        | local application           | Mirror → `WritableProjection.set`    |
| agent action              | application                 | Agent → Message → update             |
| UI behavior               | application                 | Behavior → Message → update          |

Package READMEs can then give the package-specific two-paragraph version and link to this guide.

9. **Update the root README’s architecture diagram:** Right now it correctly centers `Model · Message · update`.  Expand that slightly to make the two write paths visible:

   ```text
                Messages
                   │
                   ▼
                update
                   │
                  evo
                   │
                   ▼
                  Model
                ▲       │
                │       │ Projection / Surface
        structural      ├── Agent
        install         ├── Remote
                │       ├── Sync
         ModelRef /     ├── Mirror
         Projection     └── Mixins
   ```

   This would explain most of Foldkit Plus in one diagram.

10. **Add typechecked “architecture examples,” not just prose:** The repo already treats examples as executable documentation and runs build/typecheck/test/demo in its main checks.  Add a small `examples/state-seams` or extend `todo-app` with tests showing four intentional cases: local transition with `evo`; Remote submodel reduction; Mirror restoration through a writable projection; Sync replay through the exact same `update`. The test should make the architectural distinction concrete rather than relying on comments.

11. **Add tests for `ModelRef.modify`:** Cover top-level refs, nested struct refs, optional/dynamic refs, preservation of unrelated fields, application owner identity, and the existing special setter behavior for `.at()`/`.index()`. This is important because dynamic refs have container-aware setters specifically because Effect's `Optic.at` cannot insert an absent key. `modify` must delegate through the existing ref's `set`, not directly call `optic.replace`, or it will reintroduce that bug.

12. **Consider linting only after the convention is established:** Don't start by forcing `evo`. Once examples/docs consistently demonstrate it, consider adding or upstreaming a Foldkit lint rule such as `prefer-evo-model-update` for obvious root Model spread updates inside `update`. Keep it conservative: object spreading is perfectly valid for arbitrary value construction, Remote store internals, normalized records, etc. The useful lint target is specifically “rebuild the Foldkit Model merely to replace one or more fields.” Foldkit core already has the analogous `no-spread-in-evo` rule for nested evolution.

## Documentation sequence

I’d update the docs in this order because each later change can reuse language established earlier:

```text
1. AGENTS.md
      ↓ establishes contributor invariant

2. docs/state-model.md
      ↓ establishes conceptual vocabulary

3. root README
      ↓ establishes ecosystem mental model

4. packages/surface/README.md
      ↓ explains evo vs ref vs projection vs Surface

5. remote / sync / mirror READMEs
      ↓ explain infrastructure writes

6. agent / mixins READMEs
      ↓ explain Message-only authority

7. examples + README snippets
      ↓ make all of it executable

8. optional lint rule
      ↓ enforces the convention after it is taught
```

### Concrete code standard

The project should eventually make this feel obvious:

```ts
// ✅ Domain/application transition
const select = (model: Model, id: string): Model =>
  evo(model, {
    selectedId: () => id,
  })

// ✅ Nested ordinary state
const rename = (model: Model, name: string): Model =>
  evo(model, {
    editor: editor =>
      evo(editor, {
        name: () => name,
      }),
  })

// ✅ Infrastructure focuses a declared slice
const next = Shared.set(model, checkpoint)

// ✅ Infrastructure transforms an owned submodel
const next = App.fields.remote.modify(
  model,
  remote => Remote.update(remote, message),
)

// ❌ Don't bypass transition semantics just because a setter exists
App.fields.selectedId.set(model, id)

// ❌ Don't create another reducer inside an extension package
Agent.update(...)
Surface.update(...)
Mirror.updateApplicationState(...)
```

There is one nuance worth documenting: **a setter isn't “unsafe.”** It's an intentionally powerful infrastructure capability. What matters is *authority*. Sync is allowed to install a checkpoint because that is the job of its writable projection; an ordinary click handler shouldn't use the same mechanism to bypass the application's Message semantics.

## What I would *not* change

I would leave the fundamental `foldkit-plus` design alone. `Surface.application`, `ModelRef`, `Projection`, Remote's embedded submodel, Sync's writable shared projection, Mirror's writable slice, Agent's Message capabilities, and Mixins' no-state rule are already remarkably aligned with this interpretation. The inconsistency is mostly that **the code examples and docs don't yet give `evo` a clearly named place in the architecture**, so object spreads and structural setters can make the design appear less cohesive than it really is.

The result of this pass should be that a newcomer can look at essentially any Foldkit Plus feature and answer immediately:

> **“Is this causing an application transition, or is it structurally reconciling state whose transition authority has already been established?”**

If it's the former, they should expect `Message → update → evo`. If it's the latter, they should expect the narrow `ModelRef`/`Projection` write seam. That becomes a very strong foundation for the richer Entity/Bundle/CMS work later, because it prevents those abstractions from accidentally becoming yet another place where application state is mutated.
