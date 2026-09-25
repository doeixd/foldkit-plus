# Resumable Foldkit

**Status:** design, 2026-09-23, revised the same day where checking it against
the built phases found gaps ([ssr-PLAN.md, "What the resumable design changes
here"](./ssr-PLAN.md#what-the-resumable-design-changes-here)); its phases are
scheduled there as Phases A to F. Extends [ssr-PLAN.md](./ssr-PLAN.md) and
[SSR-DESIGN.txt](./SSR-DESIGN.txt) §26–27, which parked "binding-level
resumability" as research. This document argues it is not research for Foldkit,
because Foldkit already has the two things Qwik's compiler exists to
manufacture: serializable state and serializable handlers.

## The claim

Qwik's resumability is three things:

1. the state the page needs is in the HTML, not recomputed;
2. every event handler is addressable from the HTML without running a render;
3. code loads when an interaction needs it, and one delegated listener at the
   root catches the interaction until then.

Qwik needs a compiler for (2) because in a component framework a handler is a
closure over component scope. Foldkit's handlers are not closures over scope.
`h.OnClick(Message.ToggledTodo({ id }))` carries a **Message value**, and a
Message is a Schema-typed tagged struct that already round-trips through
`Schema.encode` and `Schema.decode`. So for that half of Foldkit's event
attributes, (2) is a serialization problem with a solution in hand.

The other half take `(value) => Message`: `OnInput`, `OnChange`, `OnKeyDown`,
`OnFileChange`, `OnPointerMove`. The closure exists only to put the event's
payload into a Message field. The Message union already knows that field and
its type. So the closure can be replaced by **a Message with a hole**: the
member constructor itself, `Message.ChangedSearch`, plus which field the event
fills. That is data too.

(1) is `SSR.plan` and its envelope, built in Phases 1–4. (3) is where a
delegated root listener and a deferred boot come in, and Foldkit's one-Model,
one-`update` shape makes the deferral safe in a way component frameworks cannot
match: there is exactly one thing to start, and starting it later loses no
component-local state, because there is none.

Foldkit's own `Runtime.hydrate` gives us the DOM adoption for free once the
view does run. So the design is: **do not run the view until the first Message
arrives; until then, the DOM answers events by itself.**

## What affect taught

`C:\Users\Patrick\effect-atom-jsx` built resumability for a fine-grained
reactive JSX runtime (docs under `docs/RESUMABILITY_*.md`, source in
`src/Resume.ts`, `resume-session.ts`, `Portable.ts`, `resume-expression.ts`).
It reached working event resumability **without a compiler** and then added
one. Where the compiler was needed tells us what a compiler is for, and none
of it applies here.

**Its model.** Code is never serialized; only addresses and Schema-validated
data are. A handler is `Portable.code({ id, buildId, captures: Schema })`, a
module export with a stable logical id, bound to captures. The element carries
an opaque per-render marker (`data-af-event-click="e0"`), and one inert JSON
manifest maps `e0` to the descriptor. The client resolves ids through a trusted
map to lazy imports, re-validates captures against the loaded code's Schema,
gates on `buildId` and a serializer id before decoding anything, size-caps the
manifest, and deep-freezes it.

**Why it needed a compiler**, per its own docs:

1. *Closure extraction.* A JSX handler closes over component scope, so a
   transform hoists it into a module-closed `Portable.code` and rewrites the
   call site. Foldkit has no component scope. A handler is a Message value, and
   a Message is a value.
2. *Stable identity for expressions.* Fine-grained text and attribute regions
   need a source-position identity because render-order counters desynchronize
   under conditionals. Foldkit has no fine-grained regions. A Message runs the
   view and patches; the only code the DOM must address is `update`.
3. *A resolver table* mapping ids to chunks. Foldkit's `update` is one
   function in the boot chunk. A table appears only with `Bundle.lazy`, and it
   is a map of Bundle names, which a build can generate or a hand can write.
4. *A runtime seam for attribute expressions* that compiled JSX did not
   provide. Foldkit's builder is the seam; every attribute is a tagged value
   before it becomes DOM.

So the compiler existed to manufacture what Foldkit's architecture already
supplies: handlers as data and one addressable reducer. That is the whole
argument, and their milestone audits confirm the manual path worked first.

**What to copy.**

- Opaque ordinal markers on elements plus one manifest, not inline JSON per
  element. Ordinals need only match the manifest of the same render, so there
  is no identity problem at all. This also answers the attribute-size risk.
- Gates before decode: build id, protocol version, size cap; then one Schema
  decode of the whole payload; then freeze. `SSR.resume` already does the
  first three for the envelope.
- Capture-phase root listeners, so non-bubbling events such as `focus` and
  `blur` are not silently dropped. Their audit found exactly that drop.
- Diagnostics as the contract: whatever cannot resume emits a collect
  diagnostic with a named fallback. Nothing opaque is silent.
- Shared in-flight loading when two events arrive before a chunk lands.
- Test what would fail under the bug; their audits found tests that passed
  with the double-dispatch race present.

**What to do differently.**

- *Propagation.* They chose "first claim wins, the walk stops", and found
  that only one of three nesting combinations was exactly-once. Foldkit's
  eager page fires every listener on the bubble path unless an attribute's
  `propagation: 'Stop'` says otherwise. The pre-boot dispatcher must do the
  same, target to root, honoring the encoded policy, because the invariant is
  equivalence with the eager page, not a new semantics.
- *Default action.* Theirs was asymmetric: portable events never prevented
  default, activation events always did. Ours is whatever the attribute
  declares, encoded with the binding and applied identically before and after
  boot. Foldkit's `OnSubmit` and `OnKeyDownPreventDefault` already say what
  they prevent.
- *Event data.* They supported only a `mouse-v1` projection and refused
  keyboard and input data as "not portable in this slice". The Message with
  a hole is exactly a projection: the event kind decides what fills the hole,
  and the member's field types are the projection Schema. The set is fixed up
  front: `value` for `input` and `change` on text controls, `checked` for
  checkboxes, `files` for file inputs, `key` and `modifiers` for keyboard,
  nothing for the rest.
- *Before boot.* They had no pre-boot queue for the static install and no
  answer for text typed before boot. Both are the center of this design.
- *Granularity.* Their fallback activates one component. Ours boots the whole
  page eagerly, which is cruder and honest. Bundle boundaries make it per
  Bundle later.

## The rules, and what a compiler would have checked

A design without a compiler is a design with rules that primitives enforce.
These are the rules; each is checked by a type, a render diagnostic, or a
test, never by convention.

1. **A handler is a value.** A Message, or a member with a hole. A closure
   handler still works and makes the page eager, with a diagnostic naming the
   element. *Checked:* the builder's types, and the render collector.
2. **Everything on the wire is a Schema value.** The Model slice, every
   Message, every projection. *Checked:* `Schema.encode` on the server,
   `Schema.decode` in the browser, with the application's own Message union.
3. **A manifest may only carry Messages an active Surface may send.**
   Surface's `messages` list is not documentation; it is the allow list for
   collection on the server and for decoding in the browser. A decoded
   Message with a tag outside the plan's allowed set is refused, and a plan
   whose page has bindings but declares no `surfaces` is refused at render,
   since it has no allowed set to decode against.
   *Checked:* Phase 3's coverage on the server, the decoder in the browser.
4. **Server-owned markup is `SSR.static`; anything a Message changes is in a
   Surface.** A binding inside a static region is refused. *Checked:* render.
5. **Identity is ordinal.** Markers number bindings in render order and match
   the same render's manifest. No code id, no source position, no build-stable
   name, because no code is addressed except `update`. *Checked:* at load,
   before any event: a marker without a manifest entry, an entry that does not
   decode, or a manifest from another build refuses the whole page (see
   Delegated dispatch).
6. **The resumed page reaches the same Model as the eager page for the same
   events.** This is the invariant the other five serve, and it is directly
   testable: run both against a recorded event sequence and compare Models.
   *Checked on the server too:* the second render, from the browser's Model,
   must produce the same manifest as the first. A Message built from a field
   the plan does not send (`Liked({ id: model.post.id })` with `post.id`
   unsent) keeps its ordinal but changes its entry, so a click before boot
   would dispatch the server's Message and after boot the browser's. That is
   `ViewDependsOnUnsentState`, naming the element.

## Why this is native, not bolted on

| Qwik concept | Foldkit already has | This design adds |
| --- | --- | --- |
| serialized store | Model Schema; `SSR.plan` state slice | nothing |
| `$()` lazy handler reference | a Message value in `h.OnClick` | an ordinal marker on the element, the encoded Message in the envelope's manifest |
| handler with event args | `(value) => Message` closure | the member-with-a-hole form |
| global event delegation | Foldkit's `RoutingConfig` link listener is already delegated | `Resume.listen` for `data-fk-on-*` |
| component boundary | Surface (what it reads, which Messages it may send); Bundle placement (a Submodel with an args Schema) | boundary attributes and coverage checks |
| no-JS fallback | pure `update`, Schema Messages | the server runs the same `update` on a posted Message |

The last row is a synergy Qwik does not have. Because `update` is pure and a
Message is a value, a form whose JavaScript has not loaded can post its Message
and the server can reduce it with the same function. Progressive enhancement
falls out of The Elm Architecture instead of being a separate feature.

## Primitives

All of this lives in `foldkit-ssr` under a `Resume` namespace. It is the same
protocol, extended: the plan already says what state crosses; now the page also
says which Messages its elements cause. No new package, because a binding
manifest is meaningless without a resume plan.

### 1. The resumable builder

A view uses the resumable builder by wrapping the `h` it is given:
`Resume.builder(h)`, or, for a renderer handed to `Surface.rootView`,
`SurfaceView.define` or an application's view, `Resume.view((model, rh) =>
...)`. Nothing changes in Foldkit core or in the Surface packages. (An
earlier draft installed the builder inside `Surface.rootView` and
`SurfaceView.define`; neither package may depend on `foldkit-ssr`, so the
adapter took its place. See ssr-PLAN Phase A.)

```ts
const rh = Resume.builder(h) // HtmlBuilder<Message>, same type, same behavior in the browser

// a Message value: already data
rh.OnClick(Message.ToggledTodo({ id }))

// a Message with a hole: the member, the event fills its one string field
rh.OnInput(Message.ChangedSearch)               // ChangedSearch: { value: String }

// a hole plus fixed fields
rh.OnChange(Message.RenamedTodo, { id })         // RenamedTodo: { id: String, title: String }, event fills `title`

// keyboard: the event fills `key` and `modifiers`
rh.OnKeyDown(Message.Pressed)                    // Pressed: { key: String, modifiers: KeyboardModifiers }
```

Typing: `rh.OnInput` accepts either the existing closure (unchanged, not
resumable, warned about on the server) or a member whose fields, minus the
fixed ones, are exactly `{ [k]: string }`. With one remaining field the name is
inferred; with more, `{ field: 'title' }` names it. The check is a conditional
type over the member's `fields`, which `defineMessageUnion` exposes, so a
mismatch fails at the call site.

What the builder does per mode:

- **Server render.** Returns the real `h.OnClick(message)` so Foldkit's own
  serializer and diagnostics see an ordinary attribute, and records the
  binding for that attribute in a WeakMap. The wrapped element functions
  (`div`, `button`, …) look each attribute up, assign the next ordinal, and
  append `h.Attribute('data-fk-on-click', 'e12')`. The binding itself goes in
  the envelope's manifest under `e12`: the encoded Message
  (`Schema.encodeSync(Message)`), or `{ _tag, fixed, hole }` for a hole, plus
  the declarative options (`defaultAction`, `propagation`) the attribute
  already carries. One element with several event attributes gets one
  ordinal per attribute.
- **Browser.** Returns `h` unchanged. The markers are not emitted, so a
  browser render never adds them and hydration never sees a mismatch, because
  Foldkit's hydrator compares against the server's markup that has them. The
  markers are stripped from the DOM by `Resume.listen` at boot, after the view
  has run, in the same tick.

Ordinals are per render and mean nothing outside the manifest of that render,
which is why there is no identity problem: no code is addressed, only a value
in the same page. The envelope already gates on build id, protocol version,
and plan id before anything decodes; the manifest rides inside it and gains a
size cap.

The render context that `SSR.static` uses (collect / replay / resume) grows a
fourth concern: the manifest, the set of event types that appear, and every
binding's Message tag. All feed the checks below, and the event types tell the
browser which listeners to install.

**Projections.** The hole is filled by a fixed projection per event kind, so
the member's field types are the projection's Schema and nothing is inferred
from a closure:

| Event kind | Fills | Type |
| --- | --- | --- |
| `input`, `change` | `value` | `String`. 0.158 reads `target.value` on every control, checkboxes included. 0.163 reads `value`, else `innerText`, else `textContent`, else `''` (`inputEventValue`), so a contenteditable element yields its text. The dispatcher calls the same helper's logic, so both versions stay equivalent to the eager page |
| `change` on a file input (`OnFileChange`) | `files` | `Array(File)`, browser only, never on the wire |
| `keydown`, `keyup`, `keypress` | `key`, `modifiers` | `String`, `KeyboardModifiers` |
| `click`, `submit`, `reset`, `focus`, `blur`, mouse and touch | nothing | the Message is complete |

Anything else (`OnPointerMove` with coordinates, `OnScroll`, `OnDrop`, and
0.163's `OnBeforeInput` with `inputType` and `data`) keeps its closure and
makes the page eager with a diagnostic. Extend the table when a real page
needs a row, not before.

**Attribute names.** ssr-PLAN decision 5 gives this package its own
namespace, `data-foldkit-plus-*`, because Foldkit reserves `data-foldkit-*`
(0.163 uses `app`, `build`, `flags`, `identity`, `key`, `refused`,
`refusal-shield`, unchanged since 0.158). Markers are therefore
`data-foldkit-plus-on-click="e12"`; this document's shorter `data-fk-on-*`
is shorthand for that. Gzip makes the length immaterial.

A binding inside an `SSR.static` region is refused at render
(`ResumeUnsafe: BindingInStaticRegion`). Static regions are rendered with the
inert builder, so this can only happen through a nested resumable builder, and
it is always a mistake.

### 2. Delegated dispatch

```ts
Resume.listen(root, { Message, events, onMessage })
```

One listener per event type in `events`, at the application root, in the
capture phase so non-bubbling events such as `focus` and `blur` are caught and
so it runs before anything Foldkit later attaches. On an event it walks the
composed path from `event.target` to the root, and for **every** element with
`data-fk-on-<type>` on that path, in that order, looks the ordinal up in the
manifest, fills the hole from the event by the projection table, applies the
binding's default-action policy, and calls `onMessage`. A binding whose policy
is `propagation: 'Stop'` ends the walk. That is what the eager page does with
Foldkit's per-element listeners, and matching it is the point.

The manifest was decoded once, at `SSR.resume`, through a Schema whose Message
field is the **application's** Message union, restricted to the tags the plan
allows. That decode is the security boundary. The page is untrusted after it
is served; a marker is a number, and a manifest entry is data until the Schema
says it is a Message the application declared and a Surface may send. A Date
or an Option field comes back typed. Nothing is trusted from a `data-`
attribute except an ordinal.

A tampered page is refused **whole, at load**, not event by event. When the
page loads, `SSR.resume` decodes every entry and checks every marker in the
root against the manifest; an entry that does not decode, or a marker with no
entry, refuses the page and contains it as any other refusal does, with the
reason logged. So no event ever reaches a marker that was not checked, and
there is no per-event refusal to define. An earlier draft refused only the
event; that would leave a half-working page, which the resume protocol never
allows.

### 3. Deferred boot

```ts
SSR.hydrate(config, plan, { buildId, start: 'on-interaction' })
//                                  start: 'now' | 'idle' | 'on-interaction'
```

- `'now'` is today's behavior.
- `'idle'` boots on `requestIdleCallback` or the first interaction, whichever
  first.
- `'on-interaction'` boots on the first Message only.

Before boot, `Resume.listen` queues decoded Messages. Boot is the existing
`SSR.hydrate` path: resume the Model from the envelope, run the view once,
adopt the DOM through `Runtime.hydrate`. When Foldkit's first patch has
committed, the queue is dispatched in order and the delegated listeners are
removed.

Two orderings matter and both fall out of the queue:

- A user typed into a search box before boot. Hydration sets the input's
  value to the Model's (empty) draft, then the queued `ChangedSearch` Messages
  replay and `update` puts the text back. The final Model is what it would
  have been with an eager boot, because the same Messages went through the
  same `update` in the same order. This is the property component frameworks
  lack: there is no per-component state to lose.
- A click before boot on an element whose handler `update` removes: the
  Message dispatches once, after boot, against the resumed Model. Same result
  as an eager page.

**When deferral is refused.** A Subscription or Managed Resource that is active
for the resumed Model would start late, and a late WebSocket or timer is a
behavior change, not an optimization. The server knows the config's
`subscriptions` and `managedResources`, so `SSR.render` evaluates each entry's
`modelToDependencies` or `modelToMaybeRequirements` against the Model it is
sending, and refuses `'idle'` and `'on-interaction'` with
`ResumeUnsafe: EagerStartRequired`, naming the entries, **unless each active
entry is declared deferrable**. An entry that activates only after a Message
is fine, because boot happens on that Message. Mounts are view-owned and run
when the view does, so they need no rule.

"Active" alone is too blunt a test, and Remote shows why. Under the default
cache-first policy, Remote's read entry plans nothing once resumed data is
present, so it starts, emits nothing, and ends; its live entry subscribes from
the cursor in the Model, so a late start misses nothing once the envelope
carries the cursor; its retention entry always emits, but collecting late is
harmless. All three are active, so the blunt rule would refuse deferral on
every page that uses Remote, though none behaves differently started late.
Whether starting late changes anything cannot be read off an entry, so it is
declared: a plan names deferrable entries by key, a resume part declares its
own package's (Remote's part declares these three), and nothing is deferrable
by default.

`boot` Commands from the plan run at boot as they do now. A page whose `boot`
restores a `Mirror.kv` draft therefore restores it on first interaction. If
that is wrong for an application, it says `start: 'now'`; the default stays
`'now'` until the semantics have been used.

### 4. Coverage, extended

Phase 3 checks that the plan's state covers what active Surfaces read. The
same pass now checks the other half of a Surface's declaration: every binding
collected during the render must have a Message tag that some **active**
Surface lists in `messages`. A binding whose Message no active Surface may
send is `Uncovered`, reported with the element's path, exactly as an uncovered
read is today.

This is the point of building on Surface rather than on components. A Surface
already says "what this reads and what it may cause". Resumability reads that
declaration from both sides: the state side decides what crosses, the Message
side decides what the DOM may dispatch. Nothing new is declared.

### 5. Bundle boundaries

A `foldkit-bundle` placement is a Submodel with a name, an args Schema, and a
key when placed per key. Its view goes through `h.submodel`, so its subtree is
a real boundary in the VNode tree. The resumable builder stamps that root with
`data-fk-bundle="Item"` and `data-fk-key="todo-1"`.

This gives two things later without deciding them now:

- **Lazy code.** A Bundle's declaration (`Bundle.declare`: Model fields and
  Message cases) is what the parent Schema and the boot chunk need. Its
  `update`, `view`, and `subscriptions` bodies can live in a chunk that loads
  on the first Message inside its boundary. `Bundle.lazy(() => import(...))`
  would keep the declaration static and the bodies dynamic. This is Qwik's
  "declare in the shell, execute on demand", with the split drawn where
  Foldkit already draws it, between a Bundle's declaration and its definition.
- **Partial view.** Once Foldkit can run a renderer per subtree with
  projection-based invalidation (SSR-DESIGN §26, an upstream change), the
  bundle root is the natural unit. Until then, the whole view runs at boot,
  which after `SSR.static` erasure is mostly Surface views anyway.

### 6. The server runs `update` too

```ts
rh.OnSubmit(Message.RequestedTodo, { title: model.draft })
```

On a form, with the plan saying `fallback: 'server'`, the builder also emits
`method="post"`, `action="/__foldkit/message"`, and a hidden input carrying
the encoded Message, so the form works before any script runs or when scripts
are blocked.

```ts
const response = yield* SSR.handle(request, config, plan, { buildId })
```

Since 0.159 Foldkit's server module is a Web `fetch` handler:
`handleRequest(request, { renderPage, template })` refuses only `CONNECT`,
`TRACE` and `TRACK` and hands everything else, `POST` included, to the entry's
`renderPage(request)`. `SSR.handle` is therefore called from `renderPage`
when the request is a `POST` to the fallback path, and returns a `Rendered`
or `Responded` like any other entry result. No second server, no new route
table.

`SSR.handle` reads the posted Message, decodes it through the Message Schema,
rebuilds the request's Model the way `SSR.render` does (`init` from Flags and
URL, then `boot`), runs `update(model, message)`, runs the returned Commands
under the config's `resources` layer, folding each result Message back through
`update` until none remain, and renders the resulting Model as a fresh page.
That is Foldkit's loop, once, on the server. It works because `update` is pure
and Commands are Effects with an explicit requirements type, so the server can
tell at the type level which Commands it can run.

For a `foldkit-sync` application the durable Message is the same one the
replica would submit, so the fallback reaches the journal through the same
reducer. That is one loop, three entry points: browser, agent, and a form
without JavaScript.

## What this does not need from upstream

Phases A–D below need no Foldkit change. The builder is a wrapper, delegation
is a root listener, deferred boot is a deferred call to `Runtime.hydrate`,
and the server loop is `update` plus Effect.

Three points where that claim depends on Foldkit internals, checked against
the pinned 0.158.2 and again against the published 0.163.0 tarball
(`dist/hydrate.js`, `dist/runtime/renderer.js`, `dist/runtime/start.js`;
identical in both):

- **Markers the browser view never produces.** The hydrator seeds each
  adopted element's clone with the element's current attributes, classes and
  inline styles, so the first patch removes whatever the browser tree does
  not reassert (`hydrate.js`, `seedAdoptedState`). Our `data-fk-on-*` markers
  are removed by that patch with no help. In development the hydrator also
  records a per-element signature and warns on an attribute-only mismatch, so
  `Resume.listen` strips the markers itself before boot, after reading them,
  which keeps a resumable page warning-free.
- **Text typed before boot.** A control's `value` is controlled current
  state; a difference from the vnode marks a mismatch (a dev warning) and the
  patch re-asserts the Model's value, after which the queued Messages replay.
  To keep the eager page's dev output identical, boot first restores each
  queued control to its server value (`defaultValue`), then hydrates, then
  replays. The caret position is lost; the text is not.
- **The first committed patch.** `Runtime.hydrate` forks the runtime, so
  the first patch lands in a later task, and the delegated listeners keep
  capturing until then. The renderer removes the root's `data-foldkit-app`
  stamp once, synchronously, immediately before that patch
  (`renderer.js`, the `pendingHydrationRoot` branch). A `MutationObserver`
  for that attribute fires as a microtask after the patch, which is the
  signal to replay the queue and remove the delegated listeners. It is
  observable behavior, not an internal import, and a test pins it so a
  Foldkit release that moves the strip is caught.

Two things would be better upstream and are already proposed in SSR-DESIGN:

- **Separate DOM adoption from boot** (§3 of its upstream section). Today boot
  means view, Subscriptions, and Managed Resources together. With that split,
  Subscriptions could start eagerly while the view waits for the first
  Message, and `EagerStartRequired` would go away.
- **Renderer per subtree** (§26) for partial views over one Model.

## Phases

Each ends in a test that can fail. Gate is the phase it builds on.

- **A. The resumable builder and its attributes.** `Resume.builder(h)`,
  encoding for both attribute kinds, the type check on the hole, attributes
  emitted only on the server, and the manifest compared between the server's
  two renders (rule 6). Test: a server render of a button and an input
  carries decodable bindings; a browser render of the same view carries none;
  a mismatched member fails to type check; a Message built from an unsent
  field is refused.
- **B. Delegated dispatch.** `Resume.listen`. Test: a click and an input on
  server markup, with no runtime booted, produce the exact Messages the
  closures would have; a tampered entry, or a marker with no entry, refuses
  the page at load, before any event, with the reason logged.
- **C. Deferred boot.** `start` option, queue, listener removal,
  `EagerStartRequired` with declared deferrability. Test: type-then-boot yields
  the same Model as an eager page; a page with an active Subscription not
  declared deferrable refuses `'on-interaction'` at render, and the same page
  with it declared renders.
- **D. Coverage and static refusal.** Test: a binding no active Surface may
  send is `Uncovered`; a page with bindings and no `surfaces` is refused; a
  binding inside `SSR.static` is refused.
- **E. Server fallback.** `fallback: 'server'` on forms and `SSR.handle`.
  Test: posting a form's Message without JavaScript returns the page a
  browser click would have produced.
- **F. Bundle boundaries.** Attributes on placement roots, then `Bundle.lazy`.
  Gate: E, and a real application that shows the boot chunk is dominated by
  Bundle bodies.

## Risks

- **Events during the boot window.** Between the first Message and Foldkit's
  first committed patch, events must still be queued. The delegated listeners
  stay until the patch commits and are removed then, so nothing is lost and
  nothing dispatches twice, because Foldkit's own listeners are attached in
  that same commit. Verify with a test that fires during the window.
- **Holes that are not strings.** `OnChange` on a `<select>` or a checkbox
  gives a string or a boolean. The hole's fill is typed by the event kind, and
  the member's field must match; a number field gets no automatic parse. The
  application keeps parsing in `update`, as it does today.
- **Manifest size.** A list of a thousand rows with three bindings each is
  three thousand manifest entries. Markers cost a few bytes each gzipped;
  entries repeat the same tag and differ in one id. Measure before adding
  anything; if it matters, the fix is the plan's Surface knowing the rows
  are one Bundle placed per key, so one entry per placement plus the key
  covers them. affect found dictionary compression pointless under
  gzip and fixed costs, not per-entry costs, dominated its heap, so decode
  once and freeze.
- **Two listeners for one event.** Foldkit's listeners attach in the boot
  commit; the delegated ones are removed in the same commit. A test fires
  during the boot window and asserts each Message dispatched exactly once.
  affect's first audit found every click dispatched twice from a
  check-then-act race in this exact spot.
- **Controlled inputs before boot.** Covered by queue order, but Foldkit's
  controlled-value handling must not clobber a value the user is still
  typing between two queued events. Test with `OnInput` and `Value` together.
- **Two ways to write a handler.** `h.OnInput(closure)` keeps working and
  simply is not resumable. The server warns once per view that a closure
  handler forces an eager boot for that page. The Oxlint plugin could later
  offer the rename; not planned here.
