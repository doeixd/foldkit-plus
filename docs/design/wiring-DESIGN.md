# Wiring: one list for every integration

> **Status:** steps 1–6 built (wiring type, assembly, `Mirror.wiring`,
> `Remote.wiring`, Sync/Agent contract wirings, both example migrations).
> What changed from the proposal is recorded under [Deviations](#deviations).

A **Wiring** generalises the assembly `foldkit-bundle` already ships
([bundle-DESIGN.md](./bundle-DESIGN.md)) so Remote, Mirror, Sync, and Agent
join an application the same way placements do.

## The problem

Every Foldkit Plus integration asks the application to wire it by hand, in
several places, and each package phrases those places differently.

**Mirror, in `examples/todo-app`**, is wired in five places across three files:

| Where | What the application writes |
| --- | --- |
| `app.ts` | `defineMessageUnion({ ...Mirror.messages, … })` |
| `surface.ts` | `Mirror.reduces(message) ? Prefs.reduce(model, message) : message._tag === 'UrlChanged' ? Filters.reduce(model, message.url) : model` |
| `runtime.ts` | `subscriptions: { ...Filters.subscriptions, ...Prefs.subscriptions }` |
| `runtime.ts` | `url: { init: (model, url) => Filters.reduce(model, url), … }` |
| `runtime.ts` | `Effect.runPromise(Prefs.restore.effect.pipe(…)).then(mounted.dispatch)` after mounting |

**Remote, in `examples/remote` and `examples/kitchen-sink`**, needs its Model
field, `...Remote.messages`, `Remote.reduces(message) ? Data.reduce(model,
message) : …` in `update`, `Data.subscriptions(active)` in the runtime config,
the `RemoteClient` layer, and `Data.contract` in the Module.

**Bundle placements** already have one list: `Page.assemble(...)` gives routing,
initial Model, Subscriptions, resources, and a completeness check.

The cost is not the typing; it is what happens when a step is missed:

| Missed step | Result |
| --- | --- |
| `...Remote.messages` or `...Mirror.messages` in the union | type error (good) |
| `Data.reduce` or `Prefs.reduce` in `update` | compiles; server results and restored values are dropped silently |
| `Data.subscriptions(active)` or `Filters.subscriptions` in the runtime | compiles; nothing is fetched, the URL is never written |
| `Filters.reduce` in `url.init` | compiles; a shared link opens with default filters |
| running `Prefs.restore` after mount | compiles; the draft is never restored |
| a contract left out of `Module.make` | compiles; `Module.validate` cannot see that owner |

Each package documents its steps, and each example gets them right, but nothing
checks them. `foldkit-bundle` showed that a single list with a completeness check
turns these into errors at the property that is wrong.

## Goal

**One list per application, from which routing, initial state, Subscriptions,
resources, startup Commands, URL handling, and the Module all derive, and whose
use is checked.**

Non-goals:

- **No runtime.** Wiring compiles to the same `update`, Subscriptions, and
  Commands the application writes today.
- **No new owner.** Wiring describes how an integration joins; ownership stays
  with the contract each package already declares.
- **No renamed Messages.** Remote's and Mirror's Messages stay flat cases of the
  application union. Agents, DevTools, and Sync journals see the same tags.
- **No forced migration.** Every lower-level API stays; wiring is the default
  path, not the only one.

## The model

```text
integration ──(package-specific config)──▶ Wiring
Wiring + Wiring + placement + … ──Page.assemble──▶ Assembly
Assembly ──complete / update / initial / subscriptions / module──▶ runtime config + Module
```

A **Wiring** is a value describing how one integration joins an application. It
is data plus pure functions, like a placement:

```ts
interface Wiring<Model, Message, R = never> {
  /** For errors and the Module: `remote:Board`, `mirror:filters`. */
  readonly key: string
  /** Message tags this integration's route handles; used to detect two claimants. */
  readonly handles: ReadonlyArray<string>
  /** Folds the Messages it handles; `None` for any other Message. */
  readonly route?: (model: Model, message: Message) => Option<Update.Return<Model, Message, R>>
  /** Runs once in `initial`: restore Commands, an initial URL read. */
  readonly init?: Update.Step<Model, Message, R>
  /** Runs when the URL changes, for integrations that read the URL. */
  readonly onUrl?: (model: Model, url: Url) => Model
  readonly subscriptions?: Subscription.Subscriptions<Model, Message, R>
  readonly resources?: ManagedResources<Model, Message>
  /** The services it needs from the runtime's `resources` Layer, by type. */
  readonly services?: Phantom<R>
  /** Its Module contract; absent for wiring that owns and observes nothing. */
  readonly contract?: Contract
}
```

Two properties matter:

1. **It is structural.** `foldkit-bundle` accepts anything of this shape; Remote
   and Mirror do not import `foldkit-bundle` to produce one. The type lives beside
   `Contract` in `foldkit-surface`, the seam every integration already depends
   on, and `foldkit-bundle` repeats it structurally so core bundles still work
   without Surface.
2. **A placement is a Wiring.** `Placed` and `PlacedCollection` already carry
   `update`, `init`, `subscriptions`, and `resources`; they gain `handles` and
   `key` and satisfy the interface. The assembly stops special-casing them.

## How each package produces one

**Remote.** The domain already has every part. `Data.wiring(active, options?)`
returns: `route` from `Remote.reduces` and `Data.reduce`, `handles` from the
Remote Message tags, `subscriptions` from `Data.subscriptions(active, options)`,
`services` as `RemoteClient`, and `contract` from `Data.contract`.

**Mirror.** `Filters.wiring(tag)` for a URL mirror takes the application's URL
Message tag and routes that variant into `Filters.reduce`, and sets `onUrl`.
`Prefs.wiring()` for a key-value mirror routes `MirrorRestored` for its own name,
puts `Prefs.restore` in `init`, and carries its subscriptions and contract.
Two key-value mirrors share the `MirrorRestored` tag, so Mirror's `route` checks
the mirror's name, and the assembly's claimant check (below) treats
`MirrorRestored` as shared.

**Sync.** Sync differs: `Sync.mount` owns the runtime rather than joining it. The
wiring is the other direction. `Sync.mount(replica, assembly.complete({ … }))`
accepts an assembly's config, so the list Sync runs is the same list. The sync
contract joins as a contract-only Wiring (`TodoSync.wiring()`), so the Module
sees it.

**Agent.** An agent adds no state and no Subscriptions. `TodoAgent.wiring()` is
contract-only, for the Module.

**Bundle placements.** Unchanged API; they satisfy `Wiring` directly.

## The assembly, generalised

`Page.assemble(...items)` accepts placements, collections, and Wiring values:

```ts
const wiring = Page.assemble(
  Page.at(Dark, { args: { query: '(prefers-color-scheme: dark)' } }),
  Data.wiring({ board: BoardSurface }),
  Filters.wiring('UrlChanged'),
  Prefs.wiring(),
  TodoAgent.wiring(),
)

const config = wiring.complete({
  init: wiring.initial({ filter: 'all', draft: '' }),
  update: wiring.update(ownUpdate),
  view,
  subscriptions: wiring.subscriptions(),
  managedResources: wiring.resources(),
  url: wiring.url(url => Message.UrlChanged({ url })),
})

const AppModule = wiring.module(App, [BoardSurface])
```

What each derivation does with Wiring:

| Derivation | Placements today | Adds for Wiring |
| --- | --- | --- |
| `update(own)` | routes by wrapper | tries each Wiring's `route`, then `own` |
| `initial(rest)` / `init` | child inits | each Wiring's `init` Step, after placements, in list order |
| `subscriptions(own)` | merged, keys prefixed | merged; a Wiring's keys are already namespaced by its package |
| `resources(own)` | merged, tags checked | merged, same tag check |
| `url(message)` | — | a runtime `url` config whose `init` and change handler run every `onUrl` |
| `module(app, items)` | `BundleSurface.module` | every Wiring's `contract` plus `items` |
| `complete(config)` | three checks | also `init` from `initial`, and `url` from `url(…)` when any Wiring reads the URL |

**Startup checks** extend the ones placements have:

- **Two claimants of one Message tag.** If two Wiring values list the same tag in
  `handles` and it is not declared shared, `update` would send it to the first
  only. `assemble` throws, naming both (the same rule placements have for
  wrappers).
- **Duplicate subscription or resource keys**, and **shared resource tags**, as
  today.

**Services.** A Wiring's `services` join the assembly's requirement type, so
`complete` can require that the runtime `resources` Layer provides
`RemoteClient` when Remote is wired: a type error at `resources` instead of a
runtime "service not found".

## Before and after: `examples/todo-app`

Before, the Mirror and Sync wiring spans `app.ts`, `surface.ts`, and
`runtime.ts` (shown above). After:

```ts
// surface.ts
export const wiring = Page.assemble(Filters.wiring('UrlChanged'), Prefs.wiring())
export const update = wiring.update(ownUpdate)

// runtime.ts
const start = wiring.initial(initialModel)
const mounted = mountTodos(replica, {
  container,
  view,
  subscriptions: wiring.subscriptions(),
  resources: storage,
  url: wiring.url(url => Message.UrlChanged({ url })),
})
for (const command of start.commands ?? []) {
  void Effect.runPromise(command.effect.pipe(Effect.provide(storage))).then(message =>
    mounted.dispatch(message),
  )
}
```

The manual `Prefs.restore` dispatch after mounting goes away (it is `Prefs`'s
`init`), and forgetting any line above is a type error. Sync and Agent stay
out of this list: their contracts derive from `App`, so importing them here
would cycle back into this module; their contracts join the Module directly
(see [Deviations](#deviations)).

## Other design improvements this surfaces

- **Flat and wrapped Messages are both right, for different owners.** A child
  machine's Messages are wrapped (the parent owns routing to a slice); an
  integration's Messages are flat (they are facts about the whole application
  that agents and journals name). The docs should state this rule once, in the
  ownership guide, instead of each package explaining its own choice.
- **`reduces` / `reduce` / `messages` differ by package.** Remote and Mirror both
  expose `messages` and `reduces`, but Remote reduces through the domain and
  Mirror through each mirror, and URL mirrors take a URL instead of a Message.
  Wiring's `route` makes these internal; the public lower-level names can then be
  aligned without breaking the main path.
- **Startup Commands have no home.** Mirror's `restore` is dispatched by hand
  after mounting; Remote has no startup Command today but will need one for
  pre-warmed queries. `init` on Wiring is that home.
- **A Remote store could be a bundle** when nothing outside its own queries reads
  it, which would make several independent stores in one application a placement
  each. Worth doing only once a real application needs two stores; not part of
  this proposal.

## Risks

| Risk | Mitigation |
| --- | --- |
| Type cost: an assembly of many Wiring values with unions of services and Messages | Benchmark alongside the placement benchmark (`docs/benchmarks.md`); keep `Wiring` shallow and structural |
| Hidden control flow: routing through a list is less visible than an explicit `if` | `route` order is list order and documented; `wiring.route(model, message)` stays inspectable; the Module lists every Wiring |
| A package's Wiring drifts from its lower-level API | Each package tests that its Wiring's `update`, `init`, and Subscriptions equal the hand-wired form (the parity approach `foldkit-bundle` uses) |
| `foldkit-surface` grows a runtime-shaped type | The type is data only, next to `Contract`; no implementation moves into Surface |

## Plan

Each step lands as small, reviewed commits with tests that can fail.

1. **Wiring type.** Add the structural `Wiring` to `foldkit-surface` and its
   mirror in `foldkit-bundle`; make `Placed` and `PlacedCollection` satisfy it
   (`key`, `handles`). No behaviour change; type tests only.
2. **Assembly accepts Wiring.** `update`, `initial`, `subscriptions`, `resources`
   take Wiring values; the claimant check; `url(message)`; `module(app, items)` in
   `foldkit-bundle-surface`. Tests with hand-written Wiring values.
3. **Mirror.wiring.** URL and key-value mirrors; parity test against
   `examples/todo-app`'s hand wiring; the restore Command moves to `init`.
4. **Remote.wiring.** Parity test against `examples/kitchen-sink`'s wiring;
   `RemoteClient` as a required service at `complete`.
5. **Sync and Agent.** `Sync.mount` accepts an assembly config unchanged (it
   already takes the config shape); contract-only Wiring for Sync and Agent.
6. **Examples.** Move `examples/todo-app` and `examples/kitchen-sink` to one
   assembly each; their pinned transcripts must not change.
7. **Docs.** The ownership guide states the flat-versus-wrapped rule; each
   package README adds a short "Wiring" section after its main example; the skill
   reference and `SKILL.md` teach the one list.

**Acceptance:** in both examples, removing any single Wiring line is a type error
or a startup error naming the integration; the pinned transcripts are unchanged;
type-check time for each example rises by no more than 25%.

Steps 1–6 are built; step 7 is this document's remaining section and the README
and skill updates. The transcripts are unchanged. Type-check time was not
measured; the assemblies add no new package dependencies beyond
`foldkit-bundle` in the two examples.

## Deviations

What the build taught the proposal:

- **One list per application became two, split by the module graph.** Sync and
  Agent contracts derive from `App` at module-evaluation time, so the module
  that builds `App` cannot import them back: the runtime assembly
  (`update`, `initial`, `subscriptions`, `url`) lives beside the mirrors and
  covers Remote/Mirror wirings, while Sync/Agent contracts join the Module
  directly. A contract-only wiring still exists for each, so the Module can be
  derived from one list later without changing the packages.
- **Services ride along in `update`'s return type.** An assembly's `update`
  carries every wiring's services (`App.Resources` becomes `KeyValueStore` or
  `RemoteClient`), because `Wiring` has one `R` for route, init, and entries.
  Examples annotate `update` to break the resulting inference cycle, and
  anything that runs `update`'s Commands provides the layer; the headless demo
  store and `mountTodos` were adjusted accordingly.
- **`route` is a method, not a property.** A wiring that routes only its own
  variants must fit an assembly over the whole application union, which needs
  parameter bivariance.
- **`Remote.wiring` keeps `Data.subscriptions`' exact keys at runtime only.**
  The branded record cannot preserve the generic `Active` key mapping through
  `Subscription.make`, so `RemoteWiring` does not redeclare the exact keys;
  its test asserts them behaviorally.
- **`Sync.mount` needed no change.** Its options already accept the assembly's
  derivations (`subscriptions`, `url`, and the runtime `resources` layer).
- **Removing a wiring line is quieter than the acceptance criterion asks.**
  Forgetting a derivation in `complete()` is a type error, and two claimants of
  one tag fail at startup naming both — but removing a wiring from `assemble`
  itself still compiles and silently drops its routing, init, and Subscriptions.
  The parity tests pin what each wiring contributes; a removal is caught by
  behaviour (the pinned transcripts), not by construction.

## Open questions

- **Should Wiring live in `foldkit-surface` or a tiny `foldkit-wiring` package?**
  Surface is already the seam every integration imports; a separate package
  avoids widening Surface. The proposal prefers Surface, since the type is data
  like `Contract`.
- **Where do URL semantics belong?** `wiring.url(message)` assumes one URL Message;
  applications with routing (`Route`) may need Mirror and routing to share it. A
  spike with a routed example decides.
- **Does `Sync.mount` want the whole assembly** (to derive its durable Message
  check from the same list) rather than only its config?
