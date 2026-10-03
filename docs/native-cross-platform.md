# Native cross-platform Foldkit

Foldkit's architecture has an unusual opportunity: a project can be authored in
TypeScript without requiring JavaScript to be the deployment runtime.

The long-term direction described here is:

> **TypeScript at authoring time; native code at runtime.**

A Foldkit application already concentrates its meaning into a small number of
explicit things: a Schema-defined Model, a Message union, a pure update
function, Commands and other Effect boundaries, and views over that state.
foldkit-plus adds Surface, Projection, Slots, Mixins, Remote, Sync, and other
contracts that make those boundaries even more explicit.

Combined with a small semantic compiler such as reffect, that architecture
could allow the same Foldkit application to target:

- the Web through normal HTML/CSS and, where useful, WebAssembly;
- iOS through native machine code plus a SwiftUI/UIKit host;
- Android through native machine code plus a Compose/native host;
- desktop through native machine code, a Web renderer, or eventually a native
  renderer.

The important point is not merely source-code reuse. The interesting target is
that the shared application does **not need a JavaScript VM on iOS or Android**.

This document describes the architecture that would make that possible, the
boundary between Foldkit and reffect, and the constraints needed to keep the
design honest.

## The core advantage: no JavaScript runtime on mobile

Many TypeScript cross-platform systems still execute the application as
JavaScript on the device:

~~~text
TypeScript
    ↓
JavaScript
    ↓
JavaScript runtime on device
    ↓
native APIs / native widgets
~~~

That is useful, but it is not the opportunity described here.

The more ambitious Foldkit path is:

~~~text
Foldkit TypeScript source
        ↓
portable semantic program
        ↓
native compilation
        ↓
┌─────────────────┬─────────────────┐
│ iOS             │ Android         │
│ ARM machine code│ ARM machine code│
└─────────────────┴─────────────────┘
~~~

TypeScript remains the language humans and agents author.

It does **not** have to remain the language the device executes.

A mobile application could therefore look like:

~~~text
iOS

SwiftUI / UIKit
      ↕ typed host boundary
compiled Foldkit application
      ↓
native machine code
~~~

and:

~~~text
Android

Compose / native UI
      ↕ typed host boundary
compiled Foldkit application
      ↓
native machine code
~~~

There is no requirement for Hermes, JavaScriptCore, V8, or another JavaScript
runtime to execute the shared Foldkit state machine.

The native program can own:

- Model transitions;
- Message handling;
- domain logic;
- validation;
- state machines;
- supported Effect programs;
- Remote and Sync logic;
- portable serialization;
- portable query/state logic;
- portable view computation where that eventually makes sense.

The host UI can stay genuinely native.

That is a different value proposition from merely putting a Web application in
a native shell.

## Why Foldkit is a good architecture for this

A Foldkit application already has one explicit state machine:

~~~text
external event
    ↓
Message
    ↓
update(Model, Message)
    ↓
new Model + Commands
    ↓
View
~~~

The following concepts are not inherently tied to a browser:

- Model;
- Message;
- update;
- Effect Schema;
- Commands as descriptions of work;
- Submodel and OutMessage;
- Projection;
- Surface;
- Remote semantics;
- Sync and Durable semantics;
- Agent contracts;
- most domain logic.

The current Web implementation becomes browser-specific later:

~~~text
portable application meaning
        │
        ▼
────────────────────────────────────
        │
HtmlBuilder
Document
Attribute
Snabbdom / VNode
HTMLElement
DOM Mount
CSS
requestAnimationFrame
browser history
hydration
document metadata
~~~

That is a useful seam.

The goal should not be to erase the Web implementation. The goal should be to
keep the application architecture above it portable enough that Web becomes one
platform backend.

## Surface is already close to a platform boundary

A Surface answers two questions:

1. What data may this feature observe?
2. Which Messages may this feature emit?

Neither question mentions the DOM.

Conceptually:

~~~text
Application
    │
    ├── Model
    ├── Message
    └── update
          │
          ▼
       Surface
   observe + emit
          │
          ├── Web presentation
          ├── iOS presentation
          ├── Android presentation
          └── desktop presentation
~~~

This allows two levels of portability.

### Shared application, platform-specific views

The simplest useful model is that all application semantics are shared while
each platform owns presentation:

~~~ts
const Todo = App.surface(...)

const WebTodo = Web.view(Todo, ...)
const IosTodo = IOS.view(Todo, ...)
const AndroidTodo = Android.view(Todo, ...)
~~~

All three consume the same projected state and can emit the same Messages.

Even if Foldkit stopped here, the amount of shared code could be substantial.

### Shared application and portable semantic view

A stronger later model is:

~~~ts
const TodoView = Portable.view(Todo, ...)
~~~

The portable view would not be HTML. It would be a small semantic UI program
that a platform renderer lowers to its own native vocabulary.

This second level should only be attempted after the first boundary is solid.

## Do not make HTML the portable language

The wrong approach is to reinterpret Web tags:

~~~text
div    → VStack?
span   → Text?
button → Button?
input  → TextField?
~~~

HTML has browser-specific semantics. Treating it as a universal UI language
would leak Web assumptions into every target.

Instead, a portable UI layer should describe intent:

~~~ts
ui.Stack(...)
ui.Text(...)
ui.Button(...)
ui.TextInput(...)
ui.Image(...)
ui.List(...)
ui.Scroll(...)
ui.Dialog(...)
~~~

A renderer can map those semantics naturally:

~~~text
Button

Web
  HTML button

iOS
  SwiftUI Button / UIKit control

Android
  Compose Button / native control

Desktop
  platform control
~~~

This should be a small capability-oriented vocabulary rather than an attempt to
standardize every widget on every operating system.

Platform-specific views must remain first-class when a portable primitive is
not enough.

## Slots and Mixins already point in this direction

The Mixins design deliberately treats Slots as structural contracts rather than
DOM nodes.

For example:

~~~ts
const FieldSlots = Slots.define({
  root: Slot.make({
    capability: Capability.Container,
  }),

  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.Focus],
  }),
})
~~~

This says:

~~~text
input
  capability: TextInput
  events:
    Input
    Focus
~~~

It does not fundamentally say:

~~~text
<input>
~~~

That distinction matters.

The same semantic capability could map to:

~~~text
Capability.TextInput

Web
  input element

iOS
  TextField / UITextField

Android
  TextField

Desktop
  native text control
~~~

The platform event is translated into the same Foldkit Message.

This makes Slots, Capabilities, Events, Behaviors, and A11y contracts promising
building blocks for a future portable view layer.

## Platform should be an explicit contract

The existing Mixins brainstorm already proposes a Platform model. That idea can
be generalized into a typed description of what a renderer/runtime provides.

Conceptually:

~~~ts
Platform.define({
  name: "web",

  capabilities: [...],
  events: [...],
  requirements: [...],
  styleProperties: [...],
})
~~~

Possible requirements include:

~~~text
Keyboard
Pointer
Hover
Clipboard
DragDrop
Camera
FilePicker
Location
NativeShare
Haptics
Notifications
~~~

A portable view or Behavior can declare what it needs.

The platform validator can then prove whether the target can provide it.

For example:

~~~text
TodoView uses HoverBehavior.

Target android-touch does not provide PointerHover.

src/todo/view.ts:73
~~~

The correct response to an unsupported capability is normally a clear refusal,
not an invisible emulation that changes semantics.

## Portable and platform-specific UI should coexist

Cross-platform architecture does not mean every screen must be identical.

A real application may contain:

~~~text
shared:
  Model
  Message
  update
  domain logic
  Surfaces
  Commands
  Remote / Sync
  most view intent

Web-only:
  a rich browser editor
  CSS-specific layout
  hover interactions

iOS-only:
  native share sheet
  platform navigation affordance
  Apple-specific media picker

Android-only:
  platform back behavior
  Android-specific intent integration
~~~

The goal is to make those differences explicit and local.

A useful target might be that 80–95% of application semantics are shared while
the remaining platform-specific behavior stays visible at typed boundaries.

That is healthier than pretending every platform is identical.

## Style needs a semantic layer and a platform layer

Today Foldkit Style ultimately emits CSS.

A portable style story should distinguish semantic choices from Web-specific
CSS.

Portable examples might look like:

~~~ts
Style.layout({
  direction: "vertical",
  gap: Space.Medium,
})

Style.typography({
  role: Typography.Body,
})

Style.color({
  foreground: Theme.text,
})
~~~

A platform can map them to:

~~~text
Web
  CSS

iOS
  SwiftUI/native layout and modifiers

Android
  Compose modifiers / Material theme

Desktop
  native layout/style system
~~~

A CSS-specific escape hatch can remain Web-only:

~~~ts
Style.css({
  position: "sticky",
})
~~~

and simply carry a Web capability requirement.

The architecture should not contort CSS-only concepts into fake native
equivalents.

## Behavior remains declarative

Portable Behavior should continue to follow the existing Foldkit rule:

> Behavior may contribute element-level interaction, but application state
> belongs in Model.

Portable Behaviors can express things such as:

~~~text
press
focus
input
selection
keyboard intent
accessibility decoration
~~~

Other behaviors can declare platform requirements:

~~~text
hover
pointer capture
clipboard
drag and drop
native share
haptics
~~~

The renderer/runtime implements the event source; the Behavior ultimately
dispatches a Foldkit Message.

No platform widget becomes a hidden second state store.

## Commands are already the right side-effect boundary

The application architecture becomes much more portable when Commands and
related Effect programs depend on semantic services instead of reading browser
globals directly.

Useful service contracts include:

~~~text
Http
Storage
Clipboard
Navigation
Notification
Camera
FilePicker
Location
Share
Haptics
~~~

Each platform supplies an implementation.

For example:

~~~text
Storage

Web
  IndexedDB / localStorage adapter

iOS
  UserDefaults / SQLite / native storage

Android
  SharedPreferences / SQLite / native storage

Desktop
  filesystem / SQLite / platform storage
~~~

Effect's service model is already a natural fit for this.

The application asks for Storage.

The target decides how Storage exists.

## Subscriptions also translate cleanly

A Subscription is conceptually:

~~~text
outside event source
      ↓
Stream<Event>
      ↓
Message
~~~

That pattern is platform-neutral.

Only the source adapter changes.

Examples:

~~~text
Web
  keyboard
  resize
  WebSocket
  online/offline state

Mobile
  app lifecycle
  connectivity
  push notification
  accelerometer

Desktop
  window lifecycle
  filesystem events
  tray/system events
~~~

The same Message/update loop remains authoritative.

## Mount should stay an escape hatch

Current Foldkit Mount is intentionally tied to an HTMLElement.

A cross-platform design should not invent a fake type claiming:

~~~text
HTMLElement == UIView == Android View
~~~

Those platforms have genuinely different imperative APIs and lifecycle
constraints.

The portable concept worth preserving is:

> Run lifecycle work against the rendered platform instance corresponding to a
> view node.

The implementation can remain platform-specific:

~~~text
WebMount
IOSMount
AndroidMount
DesktopMount
~~~

or use a capability-indexed platform handle later.

Portable applications should ideally use Mount rarely. When they do need a
native integration, the platform-specific nature should be explicit.

## Routing should separate meaning from execution

Foldkit route semantics can remain shared:

~~~text
Route union
parsing/building
Transition
route state
~~~

The navigation mechanism is platform-specific:

~~~text
Web
  URL + History API

iOS
  native navigation stack

Android
  native navigation stack

Desktop
  platform/window navigation
~~~

A route is application meaning.

Browser history is one way to realize it.

## The reffect connection

The UI/application portability story becomes much more important when paired
with reffect.

The division of responsibility should be:

~~~text
foldkit-plus

What does the application mean?
What can a feature observe and emit?
What UI capabilities does it require?
What platform services does it require?
        │
        ▼
portable semantic contracts
        │
        ▼
reffect

How does the supported program execute on this target?
Which implementation satisfies each requirement?
How is it lowered to native/WASM code?
~~~

This keeps both projects small enough to reason about.

foldkit-plus should not become a compiler backend.

reffect should not invent a UI framework.

## R as the native execution layer

The important enabling idea is that R is not a Rust-shaped source language.

R can remain a very small semantic program:

~~~text
typed values
operations
Match
static functions
Effect semantics
~~~

TypeScript acts as the authoring and metaprogramming language.

The compiler then specializes the semantic program for a target.

Conceptually:

~~~text
TypeScript Foldkit source
        ↓
R semantic program
        ↓
check / derive / plan / verify
        ↓
target implementation selection
        ↓
native code / WASM
~~~

Rust is an excellent first backend because one backend already reaches many
targets:

~~~text
R
 ↓
Rust
 ├── Linux
 ├── Windows
 ├── macOS
 ├── Android
 ├── iOS
 └── WebAssembly
~~~

This means native mobile support does not initially require a Kotlin compiler
backend or Swift compiler backend.

## Android without a JavaScript runtime

An initial Android architecture can be:

~~~text
Foldkit application logic
        ↓
        R
        ↓
       Rust
        ↓
Android native library
        ↓
typed JNI / host boundary
        ↓
Kotlin / Compose presentation
~~~

The shared application state machine executes as native code.

Kotlin/Compose handles Android presentation and native platform services.

Messages cross a narrow typed boundary rather than a generic JavaScript bridge.

## iOS without a JavaScript runtime

Likewise:

~~~text
Foldkit application logic
        ↓
        R
        ↓
       Rust
        ↓
iOS native library
        ↓
typed C ABI / generated host boundary
        ↓
Swift / SwiftUI presentation
~~~

Again, the Foldkit state machine is native.

SwiftUI can remain the UI technology without requiring the domain/application
logic to be rewritten in Swift.

## Web and WASM

The Web remains a first-class Foldkit target.

There are at least two useful deployment shapes:

~~~text
existing Foldkit Web runtime
  TypeScript / JavaScript
  HTML / CSS / DOM
~~~

and, for supported portable logic:

~~~text
Foldkit source
    ↓
R
    ↓
Rust / WASM
    ↓
browser host adapter
~~~

A Web target does not have to compile everything to WASM. The architecture can
choose the best boundary for each workload.

Browser-specific presentation can remain ordinary Foldkit HTML while compiled
logic runs in WASM where that is useful.

## Desktop

Desktop has two distinct levels.

The near-term route can reuse the Web renderer inside a desktop shell while
still compiling shared application logic natively where useful.

The stronger later route is a native renderer:

~~~text
portable Foldkit View IR
        ↓
desktop renderer
        ↓
native controls
~~~

Those are different projects and should not be conflated.

## Typed host boundaries

Native mobile/WebAssembly integration should not expose arbitrary Rust values or
an ad hoc FFI surface.

Useful host contracts can be derived from things Foldkit already knows:

- Message Schemas;
- Model or projected Model Schemas;
- Surface contracts;
- Command/service contracts;
- R function signatures.

Conceptually:

~~~text
native UI event
      ↓
typed Message
      ↓
compiled Foldkit runtime
      ↓
update
      ↓
new Model / projected Surface state
      ↓
native renderer
~~~

The host boundary should be narrow, generated where practical, and versioned.

That is much easier to reason about than sending loosely typed object graphs
through a generic bridge.

## Platform requirements should compose with compiler requirements

There is a useful symmetry between foldkit-plus and reffect.

~~~text
foldkit-plus

semantic UI capability
      ↓
platform requirement
      ↓
platform implementation


reffect

semantic operation / Effect service
      ↓
target requirement
      ↓
target implementation
~~~

For example:

~~~text
Foldkit TextInput
  requires TextInput capability

R Clock.currentTime
  requires Clock service
~~~

The same high-level principle applies:

> The program describes what it means and what it requires. The target proves
> that it can provide those requirements.

This is more robust than sprinkling target checks throughout application code.

## Native compilation changes the performance model

The goal is not simply "faster JavaScript."

There may be no JavaScript runtime involved at all.

That opens the door to:

- native memory layouts;
- Rust ownership/borrowing;
- specialized structs/enums instead of generic JS objects;
- native integer and byte representations where semantics justify them;
- native async runtimes;
- native SQL and filesystem access;
- Rayon or SIMD where semantics permit;
- target-specific optimization;
- smaller runtime surface;
- no JS-to-native transition for each application state update.

These optimizations remain compiler decisions.

They should not leak into the Foldkit programming model unless the semantics
actually differ.

## Debugging must remain TypeScript-first

Native compilation is only attractive if generated native code does not become
the user's debugging surface.

The desired chain is:

~~~text
native/WASM compiler or runtime failure
        ↓
generated target location
        ↓
R semantic provenance
        ↓
authored Foldkit TypeScript
~~~

A user should see:

~~~text
src/todo/update.ts:48
~~~

as the primary location.

Generated Rust, native symbols, or WASM offsets are backend details.

Logical R/Effect frames should remain more important than physical native stack
frames because optimization may turn recursion into loops or move work across
threads.

Cross-platform compilation must preserve source provenance rather than treating
debugging as an afterthought.

## A plausible development progression

The architecture should be proven incrementally.

### Phase 0: document the boundary

Keep Web as the only renderer.

Document which Foldkit/foldkit-plus abstractions are platform-neutral and which
are explicitly Web-specific.

Do not claim native support yet.

### Phase 1: formalize Platform

Make platform capabilities, events, requirements, and diagnostics explicit.

Web remains the reference implementation.

### Phase 2: native application-state proof

Compile a tiny Foldkit state machine such as Counter or Todo through R to native
code.

Use simple Swift and Kotlin test hosts to:

1. construct an initial Model;
2. dispatch typed Messages;
3. read the projected Model;
4. compare every transition with the Effect/JS reference.

No native renderer is required for this milestone.

This is the key proof that TypeScript-authored Foldkit logic can execute without
a JavaScript runtime.

### Phase 3: WebAssembly proof

Compile the same portable state machine to WASM.

Add one target-provided service such as Clock, logging, or Storage to prove that
the same semantic service can have a native implementation on one target and a
host import on another.

### Phase 4: portable view subset

Define only a tiny portable UI vocabulary such as:

~~~text
Stack
Text
Button
TextInput
List
~~~

Implement it for Web first.

### Phase 5: second renderer

Implement the same tiny view subset for one genuinely non-DOM platform.

The purpose is not coverage. The purpose is to force the abstraction to prove
that it is actually renderer-neutral.

### Phase 6: real mobile application

Combine:

- compiled Model/Message/update;
- native service implementations/bridges;
- native host UI;
- portable Surfaces;
- selected portable view abstractions.

Only then grow the primitive catalog based on real missing capabilities.

## What should stay platform-independent

The long-term aspiration is that these remain portable whenever their inputs and
requirements are portable:

~~~text
Model
Message
update
Submodel
OutMessage
Projection
Surface
domain logic
validation
Remote contracts
Sync/Durable contracts
Agent contracts
portable Commands
portable Subscriptions
portable view capability graph
Style/Behavior data that declares only portable requirements
~~~

## What should remain explicitly platform-specific

Some things are inherently target-owned:

~~~text
DOM
UIKit / SwiftUI internals
Compose internals
native window handles
browser CSS
native share sheets
platform navigation chrome
camera/file picker details
low-level pointer APIs
platform-specific Mounts
some accessibility implementation details
~~~

That is not a failure of portability.

The architecture succeeds when those differences are isolated instead of
infecting the application state machine.

## Non-goals

This direction does not mean:

- Foldkit is already a native mobile framework;
- HTML should be compiled mechanically into SwiftUI or Compose;
- every UI must look or behave identically on every platform;
- every CSS feature needs a native equivalent;
- DOM, UIKit, and Compose should share a fake universal element type;
- platform-specific functionality should be hidden;
- arbitrary TypeScript or arbitrary JavaScript must be compiled to native code;
- a JavaScript runtime should be bundled merely to preserve compatibility;
- native UI should gain a second state store outside Model;
- reffect should become a UI framework;
- foldkit-plus should become a machine-code backend.

## Design laws

Several design laws follow from the architecture.

### One application state machine

Platform support must not create a second reducer or hidden widget state model.

~~~text
Message → update → Model
~~~

remains authoritative.

### Portable semantics before portable syntax

Do not add a cross-platform abstraction because two APIs happen to have similar
names.

Add one when the semantic capability is stable across targets.

### Capabilities instead of guesses

A portable feature states what it requires.

A platform states what it implements.

Compatibility is checked explicitly.

### Host boundaries stay narrow and typed

Messages, Schemas, Surfaces, and service contracts should define host
communication.

Avoid generic object bridges.

### Native optimization is an implementation concern

The compiler may choose borrowing, loops, Rayon, SIMD, native layouts, or other
strategies without making them Foldkit language features.

### Escape hatches stay visible

Platform-specific UI, Services, and Mounts are allowed.

They should be explicit instead of disguised as portable behavior.

### No-JS mobile is a first-class goal

A mobile Foldkit application should be able to ship the shared state machine as
native machine code without requiring a JavaScript VM.

That is the architectural prize worth preserving.

## The long-term picture

The eventual developer experience could look conceptually like:

~~~bash
foldkit build --target web
foldkit build --target ios
foldkit build --target android
foldkit build --target desktop
~~~

with a pipeline like:

~~~text
                         Foldkit source
                              │
                  Model / Message / update
                              │
                         Surface graph
                              │
             portable UI capability graph
                              │
                ┌─────────────┴─────────────┐
                │                           │
           application logic           presentation
                │                           │
                ▼                           ▼
                R                      platform renderer
                │                           │
        target compilation                  │
         ┌──────┼──────┐            ┌───────┼────────┐
         ▼      ▼      ▼            ▼       ▼        ▼
        WASM   iOS  Android        Web     iOS    Android
                │      │           DOM    native    native
                ▼      ▼
             native machine code
~~~

The real promise is not "write Web code once and wrap it everywhere."

It is:

> **Write one explicit Foldkit application in TypeScript, compile its portable
> semantics to the target, and let each platform remain genuinely itself.**

On mobile, that can mean a native SwiftUI or Compose application whose shared
Foldkit state machine is also genuinely native — with no JavaScript runtime in
the middle.
