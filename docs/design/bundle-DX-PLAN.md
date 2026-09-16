# foldkit-bundle: developer-experience plan

> **Status:** built through W7. The sections below are the plan as written;
> [Outcome](#outcome) records where the build departed from it and why.
> [bundle-DESIGN.md](./bundle-DESIGN.md) records the resulting design.

## Why

Most friction has one root cause: **the parent's types enter as explicit
generic arguments instead of being inferred from values.** The settings page in
`examples/bundle` today:

```ts
const GotDarkMessage = Link.wrapper('GotDarkMessage', MediaQueryMessage) // field name repeated
const Dark = MediaQuery.at(Link.field<Model>()('dark', GotDarkMessage), { // curried generic
  args: { query: '(prefers-color-scheme: dark)' },
})
const Uploads = Upload.each(Link.collection<Model>()('uploads', GotUploadMessage), {
  onOut: (f: Finished): Update.Step<Model, Message> => model => ({ ... }), // annotations steer inference
})
const placements = Bundle.assemble<Model, Message>()([Dark, Uploads]) // curried again
const update = (model: Model, message: Message) =>
  Option.getOrElse(placements.update(model, message), () => ({ model })) // routing boilerplate
const init = () => placements.init(empty) // `empty` repeats every child slice, then init overwrites them
```

There are also three ways to place a child (`Link.field`, `BundleSurface.link`,
`Bundle.declare(...).at<Model>()`), and `init` needs a parameter annotation for
`Args` to infer.

## Target

```ts
const MediaQuery = Bundle.make('MediaQuery', {
  Model: MediaQueryModel,
  Message: MediaQueryMessage,
  args: Schema.Struct({ query: Schema.String }),
  init: () => ({ model: { matches: false } }),
  update: (_model, message) => ({ model: { matches: message.matches } }),
  subscriptions: ({ query }) => …,
})

const Dark = Bundle.declare(MediaQuery, 'dark')
const Uploads = Bundle.declareEach(Upload, 'uploads')

const Model = Schema.Struct({ ...Dark.fields, ...Uploads.fields, finished: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ ...Dark.cases, ...Uploads.cases, ChoseFile: { … } })

const Page = Bundle.parent({ Model, Message })
const placements = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Page.each(Uploads, { onOut: finished => model => ({ model: { …model, finished: […] } }) }),
)

const config = placements.complete({
  init: () => placements.initial({ finished: [] }),
  update: placements.update(ownUpdate),
  view,
  subscriptions: placements.subscriptions(),
})
```

No explicit generics, no annotations to steer inference, one way to place.

## Principles

- **Infer from values.** A type argument the user must write is a DX bug,
  unless it names something no value carries.
- **One obvious way.** Lower-level forms (`Link.make`, `bundle.at(link)`) stay
  as escape hatches, documented after the main path.
- **Overloads only where one concept has two natural spellings.** Every
  overload doubles the error-message surface; each must have a type test for
  its failure message.
- **Pipeable, data-last combinators** for everything that transforms a Bundle
  or Link, following Effect's `Pipeable`.
- **No new runtime.** Every item still compiles to the Foldkit lifts used today.

## Workstreams

Each workstream lands as small commits, reviewed before the next, with tests
that can fail. Order is by what every user writes, then by dependency.

### W1. `Bundle.make(name, spec)` overload

```ts
Bundle.make('MediaQuery', { Model, Message, init, update })   // new
Bundle.make({ name: 'MediaQuery', Model, Message, init, update }) // kept
```

- **Types:** two call signatures; the second's spec is
  `Omit<BundleSpec<…>, 'name'>` with `const Name extends string` inferred from
  the first argument. The implementation normalises to one spec.
- **Same for `fromParts`:** `Bundle.fromParts('SectionTabs', { Model, Message, init, parts })`.
- **Tests:** inference is identical in both forms (type test comparing the two
  results); a spec that also contains `name` in the two-argument form is a type
  error (`name` is given once); a non-literal name still infers `string`.
- **Docs:** the README and skill use the two-argument form as the main
  spelling.

### W2. Parent scope: `Bundle.parent({ Model, Message })`

```ts
const Page = Bundle.parent({ Model, Message })
Page.at(declared, config)            // a Bundle.declare result
Page.at(bundle, 'field', config)     // overload: declare inline
Page.at(bundle, link, config)        // escape hatch: any Link
Page.each(declaredEach, config)
Page.each(bundle, 'field', config)
Page.assemble(...placements)         // variadic
```

- **Inference:** `Parent` and `Message` come from the Schema values, as
  `Surface.application` does. `onOut`, `when`, and `prepare` callbacks are typed
  contextually, so no `Update.Step<Model, Message>` annotations.
- **Checks move to constraints:** the field holds the bundle's Model; the wrapper
  variant is in `Message` (checked at `Page.at`, not only at `complete`).
- **Surface integration:** `BundleSurface.parent(App)` is the same scope built
  from a Surface application. Its Links carry the application owner, so
  `BundleSurface.link` goes away.
- **Removed:** `Bundle.assemble<Model, Message>()`, `declared.at<Model>()`,
  `declaredEach.each<Model>()`; `Link.field<Parent>()` and
  `Link.collection<Parent>()` stay for custom Links but gain a non-curried form
  inside the scope (`Page.link.field('dark', wrapper)`).
- **Tests:** every existing placement test ported to the scope; type tests that
  a wrong field, a missing variant, and a missing `onOut` each fail with one
  readable message at the offending argument.
- **Benchmark:** rerun the 1/30/100-placement fixture; inferring from Schema
  values must not regress the 2.0 s check at 100 placements by more than 25%.
  If it does, find the expensive instantiation before continuing.

### W3. Assembly sugar

- **`placements.update(own)`:** returns `(model, message) => Return`, routing
  placement Messages first and the rest to `own`. The current
  `placements.route(model, message): Option<Return>` stays for custom
  composition (renamed from `update` so the names do not collide).
- **`placements.initial(rest)`:** returns `Update.Return` with the parent Model
  built from every single placement's `init` plus `rest`, the parent's own
  fields; collections start as `{}` unless `rest` gives them. `rest` is typed as
  exactly the fields no placement owns, so a missing or extra field is a type
  error. `placements.init` (the Step) stays for adding placements to an existing
  Model.
- **`onOut: Bundle.ignore`:** an explicit "drop this OutMessage" that keeps
  `onOut` required.
- **`complete` accepts `update` built by `placements.update`** without extra
  annotation.
- **Tests:** `initial` Commands match `init`'s in order; `update(own)` never
  calls `own` for a placement Message (mutation-checked).

### W4. Args as a Schema

```ts
Bundle.make('MediaQuery', {
  args: Schema.Struct({ query: Schema.String }),
  init: ({ query }) => …,   // contextually typed
})
MediaQuery.with({ query: '(prefers-color-scheme: dark)' }) // preset: a bundle with args bound
```

- **Inference:** `Args` comes from the `args` Schema, so `init`, `update`,
  `subscriptions`, and `resources` need no annotations. A spec without `args`
  keeps today's inference from `init`'s parameter.
- **Presets:** `bundle.with(args)` returns a bundle whose `Args` is `void`, so
  placements need no `args` (and `Page.at(MediaQuery.with(…), 'dark')` works).
- **Decoding:** args are decoded once at placement, so a preset built from
  untrusted input fails at `at`, not later in `update`.
- **Introspection:** the Module contract's metadata lists the placement's
  encoded args, so `Module.toMarkdown` shows how each placement was configured.
- **Tests:** a wrong preset is a type error and, when bypassed, a decode error
  naming the placement.

### W5. Pipeable bundles and links

```ts
const LoggedCounter = Counter.pipe(
  Bundle.mapUpdate(update => (model, message, args) => …),
  Bundle.withHelpers({ reset: model => ({ model: { …model, count: 0 } }) }),
  Bundle.withSubscriptions(args => extra),
  Bundle.rename('LoggedCounter'),
)

const link = Page.link.field('filters').pipe(
  Link.when(model => model.open),
  Link.andThen(Link.field('search')),
)
```

- **Bundles and Links implement `Pipeable`** (`pipeArguments` from `effect`).
- **Bundle combinators** (all data-last and data-first dual, returning a new
  bundle): `mapUpdate`, `mapInit`, `withHelpers`, `withSubscriptions`,
  `withResources`, `mapView`, `rename`, `with` (W4).
- **Link combinators:** `Link.when`, `Link.andThen` (replaces `Link.compose`,
  which stays as an alias until publish), `Link.key` (sets the placement key).
- **Placement config through pipes:** `Page.at(Dark.pipe(Link.when(…)), config)`
  gives `declare` a `when` gate.
- **Tests:** each combinator is identity-preserving where it should be (a
  bundle's own `update` is not called twice), and composes (`mapUpdate` twice
  runs outer then inner).

### W6. Typed and extensible collections

- **Typed keys:** `Bundle.declareEach(Upload, 'uploads', { key: UploadId })`
  where `UploadId` is a string-encoded Schema (branded ids). `add`, `remove`,
  helpers, `onOut`, and the keyed wrapper use `Key`, not `string`.
- **Storage interface:** the collection Link reads and writes through
  `{ get, set, remove, keys }`, with built-ins for `Record` (default), `HashMap`,
  and an array ordered by an id field. Ordering follows storage, which fixes the
  integer-like-key order caveat for arrays.
- **Tests:** the same collection suite runs against all three storages.

### W7. Error messages and docs

- **Every `Invalid<…>` names the fix,** as today, and each overload in W1, W2,
  W4 has a type test asserting its message.
- **README rewrite** around the target example: `make(name, spec)`, `declare`,
  `parent`, `assemble`, `complete`, then collections, then escape hatches
  (`Link.make`, `bundle.at(link)`), then pipes.
- **Skill reference, example, and design note** updated in the same commits as
  the API they describe.

### Later: per-placement resources

Needing a bundle factory per resource tag is the roughest remaining edge. The
sketch: a bundle declares `resources: { socket: Bundle.resource<WebSocket>() }`,
tags are minted per placement key, and child Commands reach them through
`Bundle.resourceOf(model)` or a placement-provided service. It needs a spike
against Foldkit's resource provider and should follow W2–W4.

## Sequence

| Step | Workstream | Depends on | Size |
| --- | --- | --- | --- |
| 1 | W1 `make(name, spec)` | — | small |
| 2 | W3 `update(own)`, `ignore` | — | small |
| 3 | W2 parent scope, ported tests, benchmark | W1 | large |
| 4 | W3 `initial(rest)` | W2 (needs the parent's field types) | medium |
| 5 | W4 args Schema, presets | W1 | medium |
| 6 | W5 pipeable bundles and links | W2, W4 | medium |
| 7 | W6 typed keys and storages | W2 | medium |
| 8 | W7 docs rewrite, example, skill | all | medium |

After each step: `pnpm typecheck`, `pnpm test`, the bundle example demo, and a
review of the commit before the next. After steps 3 and 6, rerun the
type-checking benchmark and record it in `docs/benchmarks.md`.

## Open questions

- **Name of the scope.** `Bundle.parent` reads well at the call site; `Bundle.host`
  or `Bundle.in` are alternatives. Decide before step 3.
- **Should `BundleSurface.parent(App)` replace `Bundle.parent` when Surface is
  present?** The plan keeps both: core stays usable in vanilla Foldkit.
- **Should `declare` survive W2's inline overload?** Keeping it lets the parent
  Message be built from `cases` before the scope exists, which the inline form
  cannot do. Planned: keep both, and document `declare` as the default.

## Outcome

Built as planned, except:

| Plan | Built | Why |
| --- | --- | --- |
| One overloaded `Page.at` / `Page.each` for declarations, field names, and Links | `Page.at` and `Page.each` for declarations, `Page.place` and `Page.placeEach` for field names; a custom Link uses `bundle.at(Page.link.field(…))` | With overloads, a wrong field read "No overload matches this call" with every signature listed. One signature per method reports the wrong field, the missing variant, or the missing `onOut` on its own line. |
| `placements.update(own)` generic over the own update's services | `update(own)` is not generic; services are named once with `Page.withServices<S>()` or `Bundle.assemble<Model, Message, S>()` | A generic call written inline in `complete`'s config stopped TypeScript inferring that config, so every check reported a false error. |
| `declared.pipe(Link.when(…))` for a gate on a declared placement | `when` in the placement config | A declaration is not a Link, and the parent type is known only at placement. |
| Typed keys through a key codec, and `HashMap` storage | Keys constrained to `string` (branded ids work), record and array-by-id storage | Keys stay strings at runtime, so Subscription dependencies and record fields need no encoding; `HashMap` Models are rare in Foldkit. |
| `initial(rest)` mounts every single placement | `rest` may give a custom-Link placement's field, which then skips its `init` | A `Link.optional` placement could otherwise never start as `None`. |
| Remove `Bundle.assemble<Model, Message>()`, `declared.at<Model>()`, and `BundleSurface.link` | Kept, documented as lower-level API after the scope | They compose by hand where no scope exists, and removing them buys nothing for code that uses the scope. |

The scope's inference costs about 10% more check time at 100 placements
(2.23 s against 2.02 s), inside the 25% budget ([benchmarks](../benchmarks.md)).
