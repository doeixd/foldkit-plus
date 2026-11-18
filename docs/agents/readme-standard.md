Read when: writing or reviewing a README or a conceptual guide.

## Documentation and README standard

A README is an **onboarding document first and a reference second**. The reader
should understand the package's idea, ownership boundary, and normal path before
meeting the full API surface. Do not make a newcomer reverse-engineer the mental
model from a feature tour.

### Required reading order

Prefer this progression for package READMEs and conceptual guides:

1. **What it is.** One short thesis: the problem the package solves and the core
   mechanism it uses.
2. **When it owns the problem.** Say what kind of state/work belongs here, what
   does not, and which neighboring package owns the adjacent cases.
3. **The mental model.** Show the smallest useful lifecycle, equation, or diagram
   before presenting APIs. For stateful systems, name the authoritative owner and
   how information moves.
4. **A sixty-second path.** One minimal, real example that proves the core idea.
   It should teach one mechanism at a time, not demonstrate every feature.
5. **Interpret the example.** Explain what each important call means, including
   what it deliberately does *not* do. Readers should not have to infer whether
   a call performs I/O, owns state, mutates data, or merely describes a contract.
6. **Build outward.** Introduce common workflows and integrations only after the
   basic loop is clear.
7. **Advanced/reference material.** Kernel APIs, transports, adapters, protocol
   details, compatibility aliases, limits, and unusual extension points belong
   after the application-facing story.

A useful default outline is:

```text
What this package is
When to use it / ownership boundaries
Mental model
Install
60-second example
Core concepts
Common workflows
Integration with neighboring packages
Failure / recovery semantics
Advanced / lower-level API
Limits / when not to use it
Reference / compatibility
```

Do not follow the outline mechanically when a package is simpler, but preserve
its direction: **why and model before machinery**.

### Teach ownership before features

Foldkit Plus packages deliberately avoid duplicate state owners. Documentation
must make that visible.

- Say **who owns the authoritative fact or transition**.
- Distinguish observation, capability, caching, mirroring, replication, and
  persistence from ownership.
- When two packages are easy to confuse, compare them near the top, not in an
  appendix. A short contrast such as `Remote = server-owned disposable facts`
  versus `Sync = client-authored durable operations` prevents pages of later
  confusion.
- Explain the seam between companion packages. For example, if one package
  derives a contract consumed by another, show that handoff as architecture,
  not as two unrelated API snippets.
- State what the package **does not own** when that boundary is important.
- Ordinary application Model changes happen in `update`, normally using
  `modifyFields`; `ModelRef.set`/`modify` and `WritableProjection.set` are
  infrastructure seams for installing already-derived values (checkpoints,
  restoration, reconciliation) — never a shortcut around a Message. See
  `docs/state-model.md`.

A Surface may span several owners precisely because it observes rather than
claims ownership. Apply the same reasoning throughout the docs: structural
access, a setter, a cache, or an adapter is not automatically a transition
owner.

### Teach the invariant or lifecycle explicitly

If the implementation revolves around one equation or loop, put it in the
README. Examples:

```text
optimistic shared state = committed snapshot + pending local operations
```

```text
Projection -> requirements -> subscription -> I/O -> Message -> reducer -> Model
```

```text
client operation -> authoritative order -> snapshot + cursor
```

The implementation may make that relationship obvious to its author; it is not
obvious to a newcomer. Prefer one diagram that exposes the invariant over five
paragraphs listing methods.

For asynchronous or state-machine APIs, show the important states and
transitions. Explain distinctions that affect UI or recovery (`Initial` versus
`Loading`, pending versus committed, acknowledged versus rejected) rather than
only listing union members.

### Keep the first example small

The first example should answer "how does the core idea work?", not "how many
features does this package have?"

- Use one entity before nested relations, one replica before mounting, one
  capability before completions, one document before fragments.
- Do not introduce pagination, optimistic mutation, live updates, persistence,
  authorization, transport configuration, and SSR in the same first example
  unless they are genuinely inseparable from the core mechanism.
- Add features in later sections so each new concept has a reason to exist.
- Prefer the public application API. Put kernel primitives and package-author
  seams under an explicit advanced section.
- If a fuller end-to-end demo already exists under `examples/`, link to it
  instead of turning the README's first example into the demo.

### Examples are executable claims

Code in a README is part of the public API contract. Treat it with the same
skepticism as tests.

- **Read the implementation and the real examples before documenting the API.**
  Do not write from memory or from an intended design.
- Use exact current names, signatures, return shapes, Message variants, service
  requirements, and ownership paths.
- Prefer snippets copied or reduced from typechecked examples/tests. When the
  repository has README fixtures or doctests, update them with the prose.
- If a snippet is intentionally schematic, label it as pseudocode or a mental
  model; do not make pseudo-API look copyable.
- Check that snippets compose with each other. Do not introduce `principal.id`
  in one section when the guide defined `{ actorId }`, or read a Model field that
  the example never declared.
- Verify important negative claims too: if the README says "this does not fetch",
  "this cannot emit Commands", or "this rejects another application's Surface",
  confirm that against the implementation/tests.
- A docs-only change still requires a diff review against source. Documentation
  can be wrong while every runtime test stays green.

### Progressive disclosure, not duplication

Avoid explaining the same mechanism in an opening feature list, a "what it
owns" list, three workflow sections, and an API reference. Explain it once at the
right level, then deepen it where needed.

- Early sections explain concepts and the normal path.
- Middle sections explain behavior, failure, and composition.
- Late sections explain low-level primitives and exhaustive details.
- A compact "owns / does not own" summary is useful; a second exhaustive feature
  catalog usually is not.
- Link to a dedicated conceptual guide when it provides depth, but the package
  README must still stand alone well enough to choose and begin using the
  package.

### Explain failure and recovery in the model

Do not hide the hard semantics in a late caveat dump. Once the reader knows the
happy path, explain the failures that change how they should design the app:
rejections, retries, stale data, checkpoints, crash gaps, retention, unsupported
versions, external-effect uncertainty, or whatever is fundamental to the
package.

State guarantees narrowly. If SQLite plus an external provider cannot provide
exactly-once effects, say so. If a cache is disposable, say refetch is recovery.
If offline edits are authoritative user intent, explain why deleting the outbox
is data loss rather than cache eviction.

### README review checklist

Before calling a README done, read it once as a newcomer and ask:

- Can I say what problem this package solves after the first two paragraphs?
- Do I know **who owns the state/fact/transition** and what neighboring packages
  own instead?
- Is there one memorable mental model before the API gets large?
- Does the first code example prove the central idea with minimal machinery?
- Is it explicit which calls are pure declarations/reads and which cause I/O or
  transitions?
- Are advanced features introduced only after the need for them is clear?
- Are failure and recovery semantics visible before I could make a bad
  architectural choice?
- Did I verify every copyable API claim against current source or a real example?
- Are conceptual diagrams consistent with the implementation rather than an
  aspirational architecture?
- Did I remove repeated feature catalogs and inflated prose?
- Could a reader stop after the core sections and successfully choose whether to
  use the package?

If several answers are "no", reorganize the document before adding more detail.
The usual failure mode is **too much correct information in the wrong order**.

