# Traps: types and TypeScript inference

Read before writing a public type, a generic signature, a type test, or an Option-returning API.

## Toolchain

- **TypeScript 7 ships no compiler API.**
  `import ts from 'typescript'` gets a version under 7, so what reads source through the API runs on 6: `foldkit-react-codegen` and `examples/site` (its API extractor) keep `typescript@6.0.3` as their own dev dependency, and `scripts/tags-check.mjs` imports the root's `typescript-6` alias. Their packages' own `tsc -b` is 6; the root's, which CI runs, is 7.
- **Effect's diagnostics under TypeScript 7 are `@effect/tsgo`, not run in CI.**
  `@effect/language-service` is a TypeScript plugin, which 7 does not load (its tsconfig entry still serves an editor on a JS TypeScript). Run `npx @effect/tsgo diagnostics --project <tsconfig> --severity error,warning` after a large Effect change. Run over every project on 2026-10-13, its errors were all in tests (unrun Effects in type tests, `return yield*` style) and its warnings mostly `unstableApiUsage` for `effect/rpc` and `effect/persistence`, used on purpose.
- **TypeScript 7.1 reports a mismatch on the argument, not the property, so a `@ts-expect-error` goes unused.**
  `pnpm typecheck:fast` (tsrs 7.1.0-beta.tsrs3) and Microsoft's own 7.1.0-beta both fail `packages/mixins-ui/test/comboboxOptions.test-d.ts` and `onInput.test-d.ts`, which `tsc` 7.0.2 passes: the `HtmlBuilder` mismatch lands on the `h` argument. Move each directive to the `h` line when the repository moves to 7.1.
- **Since TypeScript 6 no `@types` package is included by itself.**
  `types` defaults to none, so every `process`, `Buffer` and `node:` import failed until `tsconfig.base.json` named `"types": ["node"]`; a project that sets its own `types` (`vite/client`) must name `node` too.
- **`tsc -p` in a project with references reads the stale `.d.ts`.**
  It checks one project against whatever the referenced packages last emitted, passing code the dependency change broke. Use `tsc -b`.

## Inference and generics

- **A hand-written type beside a schema breaks inference when they drift.**
  `NormalizedEntity` gained an optional `revision`; `ConnectionMerged`'s hand-typed rows did not, so `RemoteMessage` stopped being a strict subtype of the app's Message and `Effect.provide` over a union of commands inferred `unknown` while plain assignability passed (every agent read the error as another's for a day). Type a wire shape once, from the schema (`Schema.Schema.Type<typeof NormalizedEntity>`).
- **An `any` inside a generic silently disables checking.**
  `Parameters<>` of an intersection resolves to the last signature and widened every payload to `any`; a conditional inside a reverse mapped type is circular and quietly picks one branch, which let `input` without `toMessage` compile.
- **`infer` reads an optional property's declared type, present or not.**
  `Wiring.shared?: ReadonlyArray<Claims>` made Remote's wiring (which shares nothing) read as sharing every tag it claims, and `own` got every Remote Message back. A type-level reading of "what this value holds" needs a property the value's own type sets (a literal), not one an interface declares for all.
- **A function-typed property makes a generic invariant.**
  `EntityDescriptor.ref: (id: Type<F['id']>) => …` made `F` invariant, so a concrete `EntityBinding` was not assignable to `EntityDescriptor<any, any>` and `Remote.make({ entities: [binding] })` failed while `Selection.make(binding, …)` (which infers `F`) passed. Declare `ref(id): …` as a method to restore bivariance; write the assignability case, not just the call that infers. It recurs whenever a parameter gains a field carrying `R`: `LiveSource.subscribe`'s context took `queries: LiveQuery<R>[]` and every `ServerDefinition<string, never>` stopped being a `ServerDefinition<any, any>` (`any` is not `never`).
- **A message-free dynamic value does not widen by `never`.**
  `Mixin<never>` is not assignable to `Mixin<Message>` (`HtmlBuilder` is invariant in `Message`), so a function taking `ContributionContext<never>` rejects one taking `ContributionContext<Message>`. Name the message-free case in the accepted union (`Mixin<Message> | StaticMixin<Message> | Mixin<never>`); a function that never mentions the Message universe does widen.
- **An intersection on a declared handle breaks `Parent.at`'s `B` inference.**
  Storing placement args on the object (an added or intersected member, even `{ readonly bound: true }`) made every `Parent.at` resolve its config args to `never`, with an explicit literal too. Keep handles exactly their declared shape, share values through imports, and suspect inference (not the value) whenever a whole call family reports `never`.
- **A curried generic's return type is an inference site for the outer call.**
  `Columns.define<Row>()({...})` inline in `DataGrid.make({ columns })` typed every `row` as `unknown` (the outer call's uninferred `Columns` became the inner call's contextual return type); a hoisted `const columns` passed. `NoInfer` on the inner return type stops it; test the inline form.
- **Tie generics to the definition they belong to.**
  A host's Message type inferred independently of the contract let an incompatible host bind.
- **To type a callback from a sibling property, map over the inferred type, not the keys you know.**
  `expose`'s variants map over the Message tags could only pin `authorize`'s input to one type for every variant (`any` kept `principal`/`model` inferable). Mapping over `keyof Ext` makes a reverse mapped type: TypeScript infers one `Ext[Tag]` per variant from its own `input` codec, then types the callbacks beside it. A conditional is fine in the template (`Tag extends keyof C ? ... : never`) and in a callback parameter (`unknown extends Ext ? Payload : Ext`); it is circular only when the mapped type is F-bounded on the object being checked. The parameter must be `V & Mapped<...>` to keep `V` for the return type, and an intersection is not excess-property-checked, so the unknown-key rejection must move into the template.
- **Thread `Encoded`, not only `Type`, through a generic reference.**
  `ModelRef<Root, Value>` typed `Schema.Codec<Value, unknown>`, so a transforming field (`NumberFromString`) lost its encoded `string` through `Projection.pick`, and an assignability test could not see it (`unknown` accepts anything). Carry an `Encoded` parameter and pin it with a type-equality assertion.
- **Foldkit's `Message.match` unifies diverse arm shapes to the first arm, and a paramless callback is typed before inference fixes anything.**
  Pin each arm's output (two `Link.child` folds each speak their own wrapper commands, so each arm is annotated `Update.Return<Model, Message, unknown>`); pinning the whole call does not reach the match's own inference. `Bundle.make` needs no explicit generics: its Model comes from the Schema and its services from every part (#334, #335). `init: () => ({ model: { status: 'idle' } })` is not context-sensitive, so TypeScript typed it first and even `NoInfer<Model>` widened `'idle'` to `string`: a `const Model` type parameter keeps it, and a per-part services parameter is needed (two candidates for one `R` pick one, not their union).

## Type tests and checks that fail open

- **Prove a type rejects, and probe each rejection alone.**
  Every constraint needs a `@ts-expect-error` negative case in `types.test-d.ts`; a suite full of positive cases passed two bugs. An unused `@ts-expect-error` is how a fails-open check announces itself (it looks like tidiness): mutation-test types by widening the constraint and confirming the negative cases go red (four did). An excess property shadows a missing one, so a case with both an unknown prop and a missing required one reports only the excess and the missing check looks vacuous: one defect per negative case.
- **A type check intersected onto a parameter can fail open.**
  `Invalid<…>` works comparing something resolved (`Q['name']`); when the check is a conditional over the type still being inferred, inference falls back to the constraint, and `Expr<any>` in that constraint made `Expr.contains`'s text check vacuously true (the number it existed to refuse passed). Constrain the type parameter instead; a constraint cannot be defeated by inference falling back to it.
- **A check keyed by a builder's tag misses the generic builders.**
  The resolver refused a protected `aria-label` given as `h.AriaLabel` but compared tags, so `h.Attribute('aria-label', …)`, `DataAttribute` and `Prop` passed, and `OnCustomEvent('click')` slipped past a protected `click` (c00a90c1, 5442e938). Compare the name a contribution actually sets.
- **Capability names can be object prototype keys.**
  `__proto__` passes name validation but assigning it to `{}` loses the registry entry: use a `Map` or a record with no prototype.
- **A cast in a test marks an API gap.**
  An audit found about a fifth of test and example casts came from our types (`subscriptions['page.read']!` on keys the runtime always emits, `dehydrate(x)!` with no size limit, `inertHtml as unknown as HtmlBuilder<M>`): fix the type. Acceptable: deliberately invalid input as `@ts-expect-error` (the rejection is asserted), an upstream brand we cannot construct, and a lookup `!` under `noUncheckedIndexedAccess`.

## Values and API shape

- **An `Option` compared with `undefined` or `null` type-checks and is always unequal; interpolated it gives `[object Object]`.**
  Moving `projectionOf` to `Option` left `projection === undefined` in a test helper (27 cms-drizzle tests failed far from the change) and a template string made a picker id `[object Object]`. After changing a return to `Option`, grep callers for `=== undefined`, `=== null`, `?.` and `${`.
- **`Schema.Option`'s encoded side is an Option, not JSON.**
  A Builder Model with `Schema.Option` fields failed to round-trip through a saved CMS draft ("Expected Option"). A stored or sent Model uses `Schema.OptionFromNullOr`.
- **A path's value type holds null, so a comparison refused it on the right.**
  `Expr.eq(Note.fields.orgId, orgOfViewer)` failed to type-check (`eq` typed its right side `Expr<ValueOf<L>>`, a path is `T | null`); every test since phase 1 put the path on the left. Type-test a comparison both ways round.
- **A constructor that starts requiring an option breaks its internal callers.**
  `writer` built its reads with `source(binding)`; once `source` refused a binding with a `Derived.exists` and no `viewer`, no writer could be made for such an Entity (tests built writers only for Like; Chirp's `writer(Db.Post)` broke). After making a constructor stricter, grep its internal callers.
- **An unused parameter or config field is a promise the runtime does not keep.**
  `RemoteServer.make(Data, …)` never read `Data`, and `Remote.make` accepted `queries`/`mutations` it dropped. Type it and use it, or delete it.
- **Do not make a caller reconstruct a key the library owns.**
  `Remote.live` took a `cursor` callback but the stream key was internal, so the application could not compute it; the library reads its own state. If a caller needs library internals to satisfy an argument, the library should read them.
