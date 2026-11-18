# Traps: types and TypeScript inference

Read before writing a public type, a generic signature, a type test, or an Option-returning API.

- **A hand-written type beside a schema breaks inference when they drift.**
  `NormalizedEntity` gained an optional `revision`; `ConnectionMerged`'s
  hand-typed rows did not, so `RemoteMessage` stopped being a strict subtype
  of the app's Message, and `Effect.provide` over a union of commands
  inferred `unknown` while plain assignability still passed. Every agent
  read the error as another's for a day. Type a wire shape once, from the
  schema (`Schema.Schema.Type<typeof NormalizedEntity>`).
- **An `Option` compared with `undefined` or `null` type-checks and is always
  unequal.** Moving `projectionOf` to `Option` left `projection === undefined`
  in a test helper; it compiled, never matched, and failed 27 cms-drizzle
  tests far from the change. Interpolating one in a template string compiles
  too, and made a picker id of `[object Object]`. After changing a return to
  `Option`, grep its callers for `=== undefined`, `=== null`, `?.` and `${`.
- **`Schema.Option`'s encoded side is an Option, not JSON.** A Builder Model
  with `Schema.Option` fields failed to round-trip through a saved CMS draft
  ("Expected Option"). A Model that is stored or sent uses
  `Schema.OptionFromNullOr`: `Option` in code, `null` on the wire.
- **TypeScript 7 ships no compiler API.** `import ts from 'typescript'` gets
  only a version under 7, so what reads source through the API runs on 6:
  `foldkit-react-codegen` and `examples/site` (its API extractor) keep
  `typescript@6.0.3` as their own dev dependency, and `scripts/tags-check.mjs`
  imports the root's `typescript-6` alias. Their packages' own `tsc -b` is 6;
  the root's, which CI runs, is 7.
- **Effect's diagnostics under TypeScript 7 are `@effect/tsgo`, not run in CI.**
  `@effect/language-service` is a TypeScript plugin, which 7 does not load;
  its tsconfig entry still serves an editor on a JavaScript TypeScript. Its
  successor patches the native compiler to report inside `tsc`, or runs alone:
  `npx @effect/tsgo diagnostics --project <tsconfig> --severity error,warning`.
  Run over every project on 2026-10-13, its errors were all in tests (unrun
  Effects in type tests, `return yield*` style), and its warnings mostly
  `unstableApiUsage` for `effect/rpc` and `effect/persistence`, which are used
  on purpose. Run it after a large Effect change.
- **Since TypeScript 6 no `@types` package is included by itself.** Its `types`
  defaults to none, so every `process`, `Buffer` and `node:` import failed
  until `tsconfig.base.json` named `"types": ["node"]`. A project that sets
  its own `types` (`vite/client`) must name `node` too.
- **`tsc -p` in a project with references reads the stale `.d.ts`.** It checks
  one project against whatever the referenced packages last emitted, so it
  passes code that the change it depends on broke. Use `tsc -b`.

- **A check keyed by a builder's tag misses the generic builders.** The
  resolver refused a protected `aria-label` given as `h.AriaLabel`, but
  compared tags, so `h.Attribute('aria-label', …)`, `DataAttribute` and `Prop`
  passed, and `OnCustomEvent('click')` slipped past a protected `click`
  (c00a90c1, 5442e938). Compare the name a contribution actually sets.

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
- **`infer` reads an optional property's declared type, present or not.**
  Typing `Wiring.shared?` as `ReadonlyArray<Claims>` made Remote's wiring,
  which shares nothing, read as sharing every tag it claims: `infer` took the
  declared element type, and `own` got every Remote Message back. A type-level
  reading of "what this value holds" needs a property the value's own type
  sets (a literal), not one an interface declares for all.
- **A function-typed property makes a generic invariant.** `EntityDescriptor.ref:
  (id: Type<F['id']>) => …` made `F` invariant, so a concrete `EntityBinding` was
  not assignable to `EntityDescriptor<any, any>` and `Remote.make({ entities:
  [binding] })` failed while `Selection.make(binding, …)` (which infers `F`)
  passed. Declaring `ref(id): …` as a method restores bivariance. Write the
  assignability case, not just the call that happens to infer. It recurs
  whenever a parameter gains a field carrying `R`: `LiveSource.subscribe`'s
  context took `queries: LiveQuery<R>[]`, and every `ServerDefinition<string,
  never>` stopped being a `ServerDefinition<any, any>` (`any` is not `never`).
- **A cast in a test marks an API gap.** Tests and examples are end-user code:
  an audit found about a fifth of their casts came from our types, such as
  `subscriptions['page.read']!` on keys the runtime always emits, `dehydrate(x)!`
  where no size limit was given, and `inertHtml as unknown as HtmlBuilder<M>`.
  Fix the type instead. Acceptable casts: deliberately invalid input, written as
  `@ts-expect-error` so the rejection is also asserted; an upstream brand we
  cannot construct; and a lookup `!` under `noUncheckedIndexedAccess`.
- **A path's value type holds null, so a comparison refused it on the right.**
  `Expr.eq(Note.fields.orgId, orgOfViewer)` failed to type-check: `eq` typed
  its right side `Expr<ValueOf<L>>`, and a path is `T | null`. Every test of
  paths since phase 1 put the path on the left. Type-test a comparison both
  ways round.
- **Prove a type rejects, not just that it accepts.** Every constraint needs a
  `@ts-expect-error` negative case in `types.test-d.ts`. Both bugs above passed
  a suite full of positive cases.
- **A type check intersected onto a parameter can fail open.** `Invalid<…>`
  works when it compares something already resolved, like `Q['name']`. When the
  check is a conditional over the type still being inferred, inference falls
  back to the constraint — and `Expr<any>` in that constraint made
  `Expr.contains`'s text check vacuously true, so every operand passed,
  including the number the check existed for. Constrain the type parameter
  instead; a constraint cannot be defeated by inference falling back to it.
- **An intersection on a declared handle breaks `Parent.at`'s `B` inference.**
  Storing placement args on the object (an added member or an intersected one)
  made every `Parent.at` resolve its config args to `never` — including with
  an explicit literal, so the value was never the problem. Probing narrowed
  it: any extra member poisons it, even `{ readonly bound: true }`. Keep
  handles exactly their declared shape; share values through imports, and
  suspect inference (not the value) whenever a whole call family reports
  `never`.
- **An unused `@ts-expect-error` is how a fails-open check announces itself.**
  It is the only signal, and it looks like tidiness. Mutation-test types the way
  you mutation-test code: widen the constraint and confirm the negative cases go
  red. Four did, so the check was load-bearing; before the fix, none would have.
- **An excess property shadows a missing one: one defect per negative case.**
  A negative case with both an unknown prop and a missing required one reports
  only the excess, so the missing check looks vacuous (its directive reads as
  unused) while the API is correct. Probe each rejection alone.
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

- **A curried generic's return type is an inference site for the outer call.**
  `Columns.define<Row>()({...})` written inline in `DataGrid.make({ columns })`
  typed every `row` as `unknown`: the outer call's still-uninferred `Columns`
  became the inner call's contextual return type, and won over `Row`. A
  separate `const columns = ...` passed. `NoInfer` on the inner return type
  stops it; test the inline form, not only the hoisted one.

- **Thread `Encoded`, not only `Type`, through a generic reference.**
  `ModelRef<Root, Value>` typed `Schema.Codec<Value, unknown>`, so a transforming
  field (`NumberFromString`) lost its encoded `string` through `Projection.pick`, and
  an assignability test could not see it (`unknown` accepts anything). Carry an
  `Encoded` parameter and pin it with a type-equality assertion.

- **A constructor that starts requiring an option breaks its internal
  callers.** `writer` built its reads with `source(binding)`; once `source`
  refused a binding with a `Derived.exists` and no `viewer`, no writer could
  be made for such an Entity. The tests built writers only for the Like
  binding and passed; Chirp's `writer(Db.Post)` broke. After making a
  constructor stricter, grep its internal callers.
- **An unused parameter or config field is a promise the runtime does not keep.**
  `RemoteServer.make(Data, …)` never read `Data`, and `Remote.make` accepted
  `queries`/`mutations` it dropped, so the API advertised a relationship that did
  not exist. Type it and use it, or delete it.

- **Do not make a caller reconstruct a key the library owns.** `Remote.live` took
  a `cursor` callback, but the stream key was internal, so the application could
  not compute it; the fix was for the library to read its own state. If a caller
  would need library internals to satisfy an argument, the library should read
  them itself.

- **Foldkit's `Message.match` unifies diverse arm shapes to the first arm.**
  Pin each arm's output, since pinning the whole call does not reach the
  match's own inference (two `Link.child` folds each speak their own wrapper
  commands, so each arm is annotated `Update.Return<Model, Message, unknown>`).
  `Bundle.make` needs no explicit generics: its Model comes from the Schema
  and its services from every part (#334, #335).
- **A paramless callback is typed before inference fixes anything.**
  `init: () => ({ model: { status: 'idle' } })` is not context-sensitive, so
  TypeScript typed it in the first pass, and `NoInfer<Model>` alone still
  widened `'idle'` to `string`; a `const Model` type parameter keeps it. A
  per-part services parameter is needed too: two candidates for one `R` pick
  one, not their union.


