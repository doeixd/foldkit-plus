# Agent working agreements

## Commit cadence

- **Commit often.** Prefer small, coherent commits over one large one. Commit as
  soon as a unit of work stands on its own (a module, a config, a test file).
- **After every commit, double check the code.** Re-read the diff that was just
  committed, re-run the relevant checks (`pnpm typecheck`, `pnpm test`,
  `pnpm build`), and fix what the check surfaces in a follow-up commit rather
  than letting it accumulate.

## Reviewing a commit

When re-reading a commit, check each of these deliberately:

- **Logic and correctness.** Does it do what the message claims? Trace the real
  control flow, not the intended one.
- **Edge cases.** Empty, missing, duplicate, already-aborted, out-of-order,
  called-twice, called-after-dispose.
- **Synergy with existing features.** Does it compose with what is already here,
  or does it bolt on a second way to do the same thing?
- **Types and TypeScript DX.** No accidental `any` (especially from
  `Parameters<>` on intersections or circular conditionals). Errors should land
  at the mistake and read clearly. Inference should work at the call site
  without annotation ceremony.
- **Comments.** Explain why, not what. Delete any comment that restates the code.
  Doc comments on public API, none on the obvious.
- **Tests.** See below -- they must be able to fail.
- **Security hardening.** Untrusted input crosses a validation boundary before
  anything else; capability and authorization checks cannot be skipped; failures
  do not leak internals.
- **Performance.** Work done once at definition time rather than per call;
  no accidental O(n) lookups or repeated derivation in a hot path.

Fix what the review finds in a follow-up commit rather than letting it sit.

## De-slop

Review for AI slop and remove it. Concretely:

- **Dead abstraction.** Wrappers that only forward to something else, indirection
  files that re-export one module, options nobody passes, type parameters that
  appear once, `_tag` discriminants never discriminated on.
- **Unused exports.** If nothing imports it and it is not deliberate public API,
  delete it. Do not export "just in case".
- **Comments that restate the code.** `// build the map` above a map build.
  Keep the ones that explain a non-obvious why -- a workaround, a subtle
  ordering, a rejected alternative.
- **Doc-comment padding.** A one-line summary beats three sentences of throat
  clearing. No `@param` that restates the parameter name.
- **Ceremonial defensiveness.** Guards for conditions the types already rule
  out, `?? undefined` on an optional call, try/catch that rethrows unchanged.
- **Copy-paste tests.** Near-identical cases that differ by one literal belong
  in a table, and repeated setup belongs in a helper.
- **Inflated prose.** In docs and commit messages, say the thing once. Cut
  "powerful", "seamless", "robust", "simply", and restated section headers.

Prefer deleting code to adding it. The smallest version that a reader
understands on one pass wins.

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

## The `foldkit-plus` agent skill

[`skills/foldkit-plus/`](./skills/foldkit-plus/SKILL.md) is an
[Agent Skill](https://agentskills.io) that teaches coding agents what each
package owns, when to use it, and basic examples. Users install it with
`npx skills add doeixd/foldkit-plus --skill foldkit-plus`
([skills.sh](https://skills.sh)), which looks for `skills/<name>/SKILL.md`.
It is published documentation: treat it like a README.

- **Layout.** `SKILL.md` is the map: what Foldkit Plus is, which package owns
  which state, how they connect, one small example. It stays under ~150 lines,
  because an agent loads all of it once the skill triggers. Depth lives in
  `references/<family>.md` (`surface`, `remote`, `sync`, `mirror`, `agent`,
  `mixins`), one level deep, read only when needed.
- **Keep it in step with the API.** A change that renames, removes, or
  re-shapes a public API, or changes what a package owns, updates the matching
  reference file in the same change. A new package gets a row in the `SKILL.md`
  table and a place in a reference file. Bump `metadata.version` on release.
- **Examples are executable claims here too.** Every snippet must compile
  against the current code: copy it with minimal fixtures into a temporary
  `*.test-d.ts` in a project whose tsconfig maps the imported package names
  (`examples/kitchen-sink` maps all of them), run `pnpm exec tsc -b <project>`,
  prove the file is checked with a deliberate error, then delete it. Import from
  published names (`foldkit-remote`), never `../src`.
- **Links are absolute.** The skill is installed without this repository, so
  "See also" links are `https://github.com/doeixd/foldkit-plus/blob/main/...`
  URLs; only links between files inside the skill are relative.
- **Frontmatter limits.** `name` matches the folder, lowercase and hyphens, at
  most 64 characters, no "claude" or "anthropic". `description` is at most 1,024
  characters, in the third person, naming the packages and the words a user
  would say, because it is all an agent sees when deciding to load the skill.

## Tests

- **Verify every test can actually fail.** After writing tests, mutate the code
  under test (invert a condition, drop a guard, return a constant) and confirm
  the relevant test goes red, then revert. A test that passes against broken
  code is worse than no test.
- Assert on real behaviour, not on restatements of the implementation. No
  assertions that hold vacuously (`expect(x).toBeDefined()` on a value that is
  always defined), no tests that only exercise a mock, and never weaken an
  assertion to make a test pass.
- If a test cannot be made to fail, delete it or replace it with one that can.

## Traps already hit here

Every item below cost real time here. Check for them by name, and **add to this
list whenever you learn a durable lesson** -- one that would have saved the work
you just redid. Keep each to a couple of lines, with the concrete failure.

**External APIs**

- **Compile adapters against the real peer types.** The Agent Native README
  registration did not type-check: its tool requires an object schema, while
  our local descriptor only promised `Record<string, unknown>`.

- **Read the spec before writing the client, and again before writing its fake.**
  The WebMCP adapter passed the registration signal on the tool descriptor
  instead of in `registerTool`'s second argument, so unregistering did nothing.
  The test fake took one argument and asserted on `descriptor.signal`, so it
  confirmed the mistake instead of catching it. A fake authored from the same
  assumption as the code tests nothing. Make it reject what the real thing
  rejects.

- **Make the wire carry every field the client sends, with the same types.**
  `RemoteClient.live` sends `{ requirements, after }`, but the `LiveRequirement`
  payload omitted `after` and `LivePatch.cursor` was a `string` while the client
  cursor is numeric, so a real server could never answer the client's own call.
  The adapter is cast, so only diffing the client's request/response types against
  the payload/success schemas catches it.

**Library behaviour**

- **Give embedded Foldkit containers an id.** The runtime fails asynchronously
  before rendering when its container has no id; a DOM test otherwise sees only
  an empty element and hides the actual initialization failure.

- **Probe, do not assume, what a library type means.** `Schema.Struct({})` is
  not an empty-object schema: it accepts `{foo:1}`, `[]` and `"str"` even with
  `onExcessProperty: 'error'`. Use `Schema.Record(Schema.String, Schema.Never)`.
  Run a scratch probe against the installed version before relying on semantics
  inferred from a name.
- **Run the probe from the package, not the repo root.** A scratch probe run
  from the root resolves a different, v3-era `effect` than the pinned rc the
  package actually compiles against, so it answers a question about the wrong
  library and looks authoritative doing it. `cd packages/<name>` first.
- **Check the output, not just that the call returned.** `defineAction` accepts
  four different schema forms without complaint; three of them advertise a tool
  with no parameters at all. An API that takes your input and quietly produces an
  empty result is worse than one that throws.
- **Enforce what you advertise.** Deriving a JSON Schema that says
  `additionalProperties: false` is not validation; the decoder has to agree.
- **`Optic.at` cannot insert.** It is a prism, not a lens: `replace` is a no-op on
  an absent key, so writing a new key (or clearing one) needs a container-aware
  setter, not `optic.replace`. Silent no-op otherwise.
- **Untrusted field names are prototype keys.** `field in values` walks the
  prototype chain; filter with `Object.hasOwn` and accumulate with no prototype.
  The Drizzle adapter's relation/computed/column maps are `Object.create(null)`,
  and app-supplied policy/window lookups use `Object.hasOwn`, because
  `RemoteServer` passes client-chosen `fields` straight to `source.read`; a
  crafted `fields: ['__proto__']` otherwise misread `Object.prototype` as a
  relation and crashed the read.
- **Effect 4 `Rpc.make` streams via `stream: true`,** not `success:
  RpcSchema.Stream(...)`. Handlers come from `RpcGroup.toLayer`; the in-process
  test client is `RpcTest.makeClient(group)`.
- **Keep intermediate validators strict too.** Agent Native's Standard Schema
  stripped excess fields before dispatch, bypassing its strict decoder. Pass
  `parseOptions: { onExcessProperty: 'error' }` to `toStandardSchemaV1`.
- **Type a boundary from the side the runtime consumes.** Dispatch decodes, so
  its input type is the schema's *encoded* side. Typing it from the decoded side
  accepted `{value: 42}` and rejected the `{value: '42'}` that works.
- **Drizzle's Effect driver does not load under the pinned Effect.**
  `drizzle-orm@1.0.0-rc.4`'s `effect-postgres` driver imports
  `cache/core/cache-effect.ts`, which calls `Schema.TaggedErrorClass` — a name
  `effect@4.0.0-rc.112` does not export. A static import throws
  `Schema$1.TaggedErrorClass is not a function` and fails every test file that
  reaches it, not just the query. Require a Context tag and let the application
  provide the database; do not import the driver in library code until the two
  versions agree.

**Effect 4, not 3**

foldkit pins `effect@4.0.0-rc.112`. Names that moved, each found the slow way:
`Effect.either` -> `Effect.result`, `Effect.async` -> `Effect.callback`,
`Effect.timeoutFail` -> `Effect.timeoutOrElse`, `Duration.decodeUnknown` ->
`Duration.fromInputUnsafe`, `Schema.OptionFromSelf` -> `Schema.Option`. Check the
installed `.d.ts` before reaching for a remembered API.

**Types**

- **Capability names can be object prototype keys.** `__proto__` passes name
  validation but assigning it to `{}` loses the registry entry. Use a `Map` or
  a record with no prototype for capability lookups.

- **A message-free dynamic value does not widen by `never`.** `Mixin<never>` is
  not assignable to `Mixin<Message>`: `HtmlBuilder` is invariant in `Message`, so
  a function taking `ContributionContext<never>` rejects one taking
  `ContributionContext<Message>`. Name the message-free case in the accepted
  union (`Mixin<Message> | StaticMixin<Message> | Mixin<never>`) rather than
  expecting `never` to widen. A function that never mentions the Message universe
  does widen.

- **An `any` inside a generic silently disables checking.** `Parameters<>` of an
  intersection resolves to the last signature and widened every payload to
  `any`. A conditional inside a reverse mapped type is circular and quietly
  picks one branch, which let `input` without `toMessage` compile.
- **A function-typed property makes a generic invariant.** `EntityDescriptor.ref:
  (id: Type<F['id']>) => …` made `F` invariant, so a concrete `EntityBinding` was
  not assignable to `EntityDescriptor<any, any>` and `Remote.make({ entities:
  [binding] })` failed while `Selection.make(binding, …)` (which infers `F`)
  passed. Declaring `ref(id): …` as a method restores bivariance. Write the
  assignability case, not just the call that happens to infer.
- **A cast in a test marks an API gap.** Tests and examples are end-user code:
  an audit found about a fifth of their casts came from our types, such as
  `subscriptions['page.read']!` on keys the runtime always emits, `dehydrate(x)!`
  where no size limit was given, and `inertHtml as unknown as HtmlBuilder<M>`.
  Fix the type instead. Acceptable casts: deliberately invalid input, written as
  `@ts-expect-error` so the rejection is also asserted; an upstream brand we
  cannot construct; and a lookup `!` under `noUncheckedIndexedAccess`.
- **Prove a type rejects, not just that it accepts.** Every constraint needs a
  `@ts-expect-error` negative case in `types.test-d.ts`. Both bugs above passed
  a suite full of positive cases.
- **Tie generics to the definition they belong to.** A host's Message type
  inferred independently of the contract let an incompatible host bind.
- **To type a callback from a sibling property, map over the inferred type, not
  over the keys you already know.** `expose`'s variants map was mapped over the
  Message tags, so `authorize`'s input could only be pinned to one type for
  every variant, and `any` was what kept `principal`/`model` inferable. Mapping
  over `keyof Ext` instead makes it a *reverse mapped type*: TypeScript infers
  one `Ext[Tag]` per variant from that variant's own `input` codec, then
  contextually types the callbacks beside it. A conditional is fine in the
  template (`Tag extends keyof C ? ... : never`) and in a callback parameter
  (`unknown extends Ext ? Payload : Ext`); it is only circular when the mapped
  type is F-bounded on the object being checked. The parameter must be
  `V & Mapped<...>` to keep `V` for the return type -- and an intersection is
  not excess-property-checked, so the unknown-key rejection has to move into the
  template.

- **Thread `Encoded`, not only `Type`, through a generic reference.**
  `ModelRef<Root, Value>` typed `Schema.Codec<Value, unknown>`, so a transforming
  field (`NumberFromString`) lost its encoded `string` through `Projection.pick`, and
  an assignability test could not see it (`unknown` accepts anything). Carry an
  `Encoded` parameter and pin it with a type-equality assertion.

- **An unused parameter or config field is a promise the runtime does not keep.**
  `RemoteServer.make(Data, …)` never read `Data`, and `Remote.make` accepted
  `queries`/`mutations` it dropped, so the API advertised a relationship that did
  not exist. Type it and use it, or delete it.

- **Do not make a caller reconstruct a key the library owns.** `Remote.live` took
  a `cursor` callback, but the stream key was internal, so the application could
  not compute it; the fix was for the library to read its own state. If a caller
  would need library internals to satisfy an argument, the library should read
  them itself.

- **Bundle authoring needs explicit types in three places; inference drops
  precision in each.** A service-requiring bundle helper pins the whole spec's
  `R` to `never` (annotate `make`'s generics explicitly); literal Model fields
  widen to `string` through inference (same fix); and `Message.match` unifies
  diverse arm shapes to the first arm (pin its output at the call).

**Async**

- **Re-check invariants after every `await`.** A `disposed` flag read once
  before two awaits still registered tools after disposal.
- **Ask what else can run while you are suspended.** Moving bookkeeping after
  an await fixed a false-success bug and introduced double registration;
  overlapping passes had to be serialized.
- **Subscribe before the action that can produce the event.** `update` can emit a
  completing Message synchronously, so a listener attached after the dispatch
  misses it and then waits for its timeout.
- **Guard fire-and-forget work.** An un-awaited reconcile turned a failure into
  an unhandled rejection.
- **`Effect.result` captures failures, not defects.** At an edge that must not
  throw, catch as well.

**Tests**

- **A surviving mutation usually means redundancy, not missing coverage.** This
  has now happened three times: overlapping disposal guards, then a `release()`
  duplicating an `Effect.ensuring`. The fix is to delete the redundant guard, not
  to write a test for a window that does not exist. One guard per window, one
  test per guard.
- **Verifying by hand is not coverage.** `Agent.pick`'s snapshot bug was
  confirmed in a scratch script and shipped without a test.
- **Cleaning up the DOM can hide a leaked runtime.** Removing the embed
  container on unmount made a `FoldkitComponent` that never called `dispose`
  look identical to one that did. Assert on something only a live runtime does,
  such as a Subscription finalizer running.
- **A wait is only tested where something re-evaluates it.** The Agent + Sync
  test asserted "still pending before the exchange" and passed with the
  committed view reading the optimistic value: nothing notified between persist
  and exchange, so the wrong read was never evaluated. Force a transition
  between the two states the test tells apart.

**Tooling**

- **Vite 5 does not recognize `node:sqlite` as a builtin.** A static import
  under Vitest is rewritten to a bare `sqlite` and fails to load;
  `test.server.deps.external` does not help because resolution happens first.
  `vitest.config.ts` aliases `node:sqlite` to `test-support/sqlite.ts`, so a
  normal static import works in Vitest and tsx. Do not reinstate per-file
  `createRequire`.

- **Writing a file can turn `\u0000` into a raw NUL.** Moving Remote's
  requirement code by rewriting it whole emitted literal NUL bytes for the
  escapes, so git showed `requirement.ts` as `Bin` and editors rendered
  the escape as an invisible character in `replace('\u0000', ' ')`. After
  writing code that contains control-character escapes, check
  `git diff --stat` for `Bin` and grep for the escape.
- **Python's text mode writes CRLF on Windows.** Scripted edits with
  `open(p, 'w')` turned `tsconfig.json` and `vitest.config.ts` into CRLF files
  that failed `format:check`. Pass `newline=''` when reading and writing.
- **Format with `pnpm format`, never bare `prettier`.** The config matches the
  style already in the tree; without it prettier rewrites files to its own
  defaults. Markdown is deliberately ignored, because prettier pads table
  columns and reformats code inside fenced blocks, rewriting the documents'
  illustrative snippets.
- **A re-exported type and a same-named const collide.** `export { type Sync }
  from './sync.js'` beside `export const Sync = {…}` is `TS2323 Cannot redeclare
  exported variable`, even though a type and a value may share a name. Both
  names have to originate in the same module: import the type under an alias
  (`type Sync as SyncContract`) and re-declare it (`export type Sync<…> =
  SyncContract<…>`). Namespacing a package whose main type shares the
  namespace's name hits this immediately.
- **`@ts-expect-error` is anchored to the next line.** Reformatting wrapped a
  long call and left two directives pointing at a line that no longer errors, so
  the assertions silently stopped asserting. Put the directive immediately above
  the offending expression, not above a call that contains it, and re-run
  `pnpm typecheck` after formatting.
- **Bulk edits replace every occurrence, and a missing anchor fails silently.** A
  scripted insert landed in two functions and broke an unrelated one; a later one
  matched nothing and quietly did not apply, so a field was simply absent. Assert
  the anchor, then re-read the diff -- not just the check.
- **Run the CI sequence before committing, not after.** `format:check`,
  `typecheck`, `test`, `demo`. A commit shipped that would have failed
  `format:check` because only the last three were run.
- **`pnpm ci` is a pnpm builtin, not your script.** A root script named `ci`
  never runs (`ERR_PNPM_CI_NOT_IMPLEMENTED`). The full-check script is `check`:
  run `pnpm check`.
- **Map every workspace dep in a composite example's `paths`.** A package's
  `tsconfig.build.json` emits to `.tsbuild/build`, not `dist`, so resolving an
  import through `exports` fails on a clean checkout; a stale local `dist` hides
  it and only CI's `typecheck:force` goes red. `examples/kitchen-sink` omitted
  `foldkit-remote-drizzle` and failed with `Cannot find module` plus cascading
  `unknown` types. Diff the example's `paths` against its `workspace:` deps.

## Repository

- Workspace: pnpm, `packages/*` and `examples/*`.
- Build: `tsdown`. Tests: `vitest`. Types: `tsc -b`. Format: `prettier`.
- CI runs `format:check`, `typecheck`, `test`, and `demo` on push and PR. Run
  the same four locally before committing.
- `PLAN.md` is git-ignored and tracks in-progress work.
