# Foldkit Plus Rich Text

**Status:** Phase 1 in progress: unpublished document and text-transaction foundation implemented. Kits, structural edits, transforms, and the three integration proofs remain unfinished. Phases 2–12 are not started.
**Target:** `doeixd/foldkit-plus`
**Primary new packages:** `foldkit-richtext`, `foldkit-richtext-dom`
**Likely integration packages:** `foldkit-mixins-richtext`, `foldkit-richtext-loro` / `foldkit-richtext-sync`
**Existing packages affected:** `foldkit-form`, `foldkit-cms`, potentially `foldkit-sync`
**Prior art:** Lexical, Loro Rich Text, Peritext, Fugue, Eg-walker, Yjs
**Goal:** Build a Lexical-class rich-text and structured-content editor whose document model, editing operations, rendering, collaboration, CMS integration, extensibility, and agent capabilities fit Foldkit's existing architecture instead of introducing a second state/runtime framework.

## Implementation entry point

Start with Phase 1 (§101): semantic documents, atomic transactions, and position
mapping. Before committing to the representation, prove controlled Bundle
ownership, a non-RichText stateful Form control, and the collaboration replay
boundary in small feasibility spikes. These are prerequisites for the DOM editor,
not early delivery of the full Form or collaboration integrations.

Existing machinery to reuse explicitly:

- Bundle placement, helpers, and `OutMessage` routing for child transitions and
  lifecycle; prove repeated controls against the current managed-resource limits.
- `foldkit-metadata` for interpreter-owned metadata on Kit definitions, never as
  serialized document content.
- Sync's existing ephemeral presence channels and TTL tracking for remote selections.
- The history primitive only where its authoritative `present` value fits the
  ownership model; collaborative undo remains a different operation.

The API snippets below are design sketches, not currently available APIs.

---

# 1. Decision

Foldkit Rich Text should be built around a typed semantic document and explicit editing operations.

The architecture is:

```text
                        RichText Kit
             nodes · marks · rules · metadata
                             │
                             ▼
                    RichText.Document
                       semantic value
                             │
                  ┌──────────┼──────────┐
                  │          │          │
                  ▼          ▼          ▼
                render      editor    tooling
                            Bundle      AI
                              │
                       local intents
                              │
                              ▼
                      RichText engine
                              │
                       Transactions
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
          single-user       Sync           serialization
             │                │
             │         convergent Change
             │                │
             ▼                ▼
           Model         Durable journal
```

The central rules are:

> **The document is semantic data, not HTML or DOM.**

> **Editor interaction is expressed as Messages and Transactions.**

> **The DOM editor is an interpreter of semantic state, not the source of truth.**

> **Collaboration strengthens the semantics of durable changes; it does not introduce a second application model.**

> **Rich text should reuse Bundle, Form, CMS, Mixins, Surface, Sync, Durable, and Agent wherever their existing ownership boundaries already fit.**

---

# 2. Why Rich Text fits Foldkit unusually well

A serious rich-text editor needs clear answers to several questions:

```text
What is the document?

What does an edit mean?

Who owns selection?

How is browser DOM reconciled?

What is persistent?

What is local-only?

How are extensions registered?

How do several clients merge edits?

How is history represented?

How do custom interactive nodes work?
```

Foldkit already has strong architectural answers for most of these:

```text
semantic state              Model / typed data

semantic transitions        Messages / update

reusable child machinery    Bundle

view customization          Mixins

feature boundaries          Surface

server-owned data           Remote

local-first operations      Sync

authoritative journal       Durable

CMS drafts/revisions        Cms.editor

external capabilities       Agent
```

The rich-text packages should fill only the missing semantic and DOM-specific pieces.

---

# 3. What Rich Text owns

`foldkit-richtext` should own:

```text
Document
Node
Text
Mark
Selection
Position
Range
Kit
Transaction
Edit
Transform
ChangeSet
validation
normalization
serialization abstractions
document inspection
```

It should not own:

```text
DOM
contenteditable
browser events
network transport
CMS lifecycle
database persistence
application routing
generic state management
authorization
design-system styling
```

Those belong elsewhere.

---

# 4. Package architecture

Recommended initial structure:

```text
foldkit-richtext
    semantic document model
    nodes / marks
    positions / selections
    transactions
    transforms
    normalization
    rendering contracts
    schemas
    inspection


foldkit-richtext-dom
    contenteditable ownership
    beforeinput
    composition / IME
    browser selection
    clipboard
    drag/drop
    DOM reconciliation
    DOM ↔ semantic position mapping


foldkit-mixins-richtext
    default editor chrome
    toolbar
    menus
    block controls
    node renderer Slots
```

Later:

```text
foldkit-richtext-loro
    Loro-backed convergent state/change engine

foldkit-richtext-sync
    Foldkit Sync bridge / collaboration contract
```

Do not create all packages before the seams are proven.

---

# 5. Document is semantic data

The canonical content value must not be HTML.

A document should look conceptually like:

```ts
RichText.document([
  Paragraph([
    Text("Hello "),
    Text("world", {
      marks: [Bold],
    }),
  ]),

  Heading(2, [
    Text("A typed document"),
  ]),

  Callout(
    { tone: "info" },
    [
      Paragraph([
        Text("Custom blocks are ordinary nodes."),
      ]),
    ],
  ),
])
```

Conceptually:

```text
Document
 ├── Paragraph
 │    ├── Text("Hello ")
 │    └── Text("world", bold)
 │
 ├── Heading(level=2)
 │    └── Text(...)
 │
 └── Callout(tone=info)
      └── Paragraph
           └── Text(...)
```

From this semantic value the application can derive:

```text
editable DOM
read-only Foldkit HTML
HTML serialization
Markdown
plain text
search indexing
AI context
CMS preview
```

---

# 6. Document versus editor state

Persistent content and transient editor state are different.

Persistent:

```text
Document
```

Editor-local:

```text
Selection
focus
composition state
history grouping
drag state
toolbar state
remote-presence decorations
```

Conceptually:

```ts
interface EditorState {
  readonly document: Document
  readonly selection: Selection | null
}
```

may be useful internally for transactions.

But only:

```text
Document
```

belongs in ordinary published content.

This prevents:

```text
cursor positions
focus
IME composition
temporary toolbar state
```

from leaking into CMS revisions or databases.

---

# 7. Node model

Nodes should have stable semantic identities.

Conceptually:

```ts
interface Node {
  readonly id: NodeId
  readonly type: string
}
```

Important broad categories:

```text
Document

Block
    Paragraph
    Heading
    Quote
    List
    CodeBlock
    Callout
    ...

Inline
    Mention
    Emoji
    InlineCode
    ...

Text
    actual editable text runs

Atom / Embed
    Image
    ProductCard
    Diagram
    Poll
    ...
```

Applications should be able to define new Node kinds.

The initial implementation also provides `Node.make(id)`: an immutable identity
reference exposing `id`, `read(document)`, and `at(offset, affinity)`. It creates
no content or registry entry. Reads resolve against the supplied document and
return a block, text run, or absence. Position construction validates shape;
transactions check existence, node kind, and bounds. References are document-local
and carry no authorization. This separates a reusable identity from a snapshot
of node content without adding a state owner. It does not replace future Kit
node-kind definitions or the collaboration engine's stable position anchors.

---

# 8. Node definitions

A custom node should be declared using typed data.

For example:

```ts
const Callout = RichText.block("Callout", {
  Props: Schema.Struct({
    tone: Schema.Literals([
      "info",
      "warning",
      "danger",
    ]),
  }),

  children: RichText.blockContent,
})
```

An atomic node:

```ts
const Image = RichText.atom("Image", {
  Props: Schema.Struct({
    assetId: AssetId,
    alt: Schema.String,
    caption: Schema.optional(Schema.String),
  }),
})
```

A structured application node:

```ts
const ProductCard = RichText.embed(
  "ProductCard",
  {
    Props: Schema.Struct({
      productId: ProductId,
    }),
  },
)
```

Effect Schema remains the validity source for node attributes.

---

# 9. Marks

Inline formatting should use semantic marks rather than arbitrary DOM nesting.

For example:

```text
Bold
Italic
Underline
Code
Link
Highlight
Comment
Suggestion
```

A text span conceptually becomes:

```ts
Text("Foldkit", {
  marks: [
    Bold,
    Link.of({
      href: "/docs",
    }),
  ],
})
```

This avoids making application semantics depend on whether HTML happened to be:

```html
<strong><a>...</a></strong>
```

or:

```html
<a><strong>...</strong></a>
```

---

# 10. Mark definitions

Marks should be extensible.

```ts
const Highlight = RichText.mark(
  "Highlight",
  {
    Props: Schema.Struct({
      tone: Schema.Literals([
        "yellow",
        "green",
        "pink",
      ]),
    }),

    expand: "after",
  },
)
```

A mark definition may describe:

```text
Schema
boundary expansion behavior
whether multiple values may overlap
metadata
```

Suggested expansion vocabulary:

```text
before
after
both
none
```

This is important for expected editor behavior.

Typing immediately after bold usually continues bold.

Typing immediately after a hyperlink usually should not extend the link.

That distinction belongs in mark semantics, not ad hoc DOM code.

---

# 11. Overlapping annotations

Some rich-text concepts should overlap independently:

```text
comments
annotations
suggestions
AI citations
named entities
search highlights
```

A single key such as:

```text
comment
```

cannot represent overlapping independent comments.

The mark system should therefore support semantic mark identity:

```text
comment:123
comment:456
```

or a first-class annotation id.

This lets:

```text
comment A
     ───────────

       ───────────
       comment B
```

coexist over overlapping text.

---

# 12. Kit

A `RichText.Kit` defines the vocabulary and rules available in one editor.

For example:

```ts
const ArticleKit = RichText.kit({
  nodes: [
    Paragraph,
    Heading,
    Quote,
    List,
    Image,
    Callout,
    ProductCard,
  ],

  marks: [
    Bold,
    Italic,
    Code,
    Link,
    Highlight,
    Comment,
  ],

  transforms: [
    MergeAdjacentText,
    NormalizeLists,
    AutoLink,
  ],
})
```

The Kit is analogous to Composition's Catalog.

Use `foldkit-metadata` for extension facts attached to Kit, Node, and Mark
definitions. Each interpreter owns its metadata key. These runtime declarations
must stay outside the document codec; persisted props remain schema-defined data.

It answers:

```text
Which nodes exist?

Which marks exist?

Which children may occur where?

How are node props validated?

Which transforms apply?

What may the editor insert?

What vocabulary may an agent use?
```

It must not become an application registry.

---

# 13. Child constraints

Node definitions should describe structural validity.

Examples:

```text
Document
    accepts blocks

Paragraph
    accepts inline/text

Heading
    accepts inline/text

List
    accepts ListItem

ListItem
    accepts blocks

Image
    accepts nothing
```

The type system should provide broad capabilities such as:

```text
BlockContent
InlineContent
TextContent
Atom
```

while applications may define narrower constraints.

This is similar to Composition Regions, but the rich-text tree has stricter editing invariants and should remain its own model.

---

# 14. Rich Text and Composition remain separate

Rich Text and Page Composition share patterns:

```text
typed node definitions
stable identities
semantic operations
renderer independence
metadata
inspection
migration
AI-friendly structure
```

But they should not share one universal document abstraction.

Rich text requires:

```text
character positions
ranges
marks
selection affinity
text splitting
text merging
IME
clipboard slices
fine-grained edits
```

Composition requires:

```text
Regions
coarse structural nodes
layout
component placement
page bindings
```

The correct relationship is composition:

```text
Page Composition
      │
      └── RichText Block
             │
             └── RichText.Document
```

not inheritance.

---

# 15. Positions

Raw numeric offsets are insufficient as the general semantic position representation.

A basic selection might initially look like:

```ts
interface TextPosition {
  readonly node: TextNodeId
  readonly offset: number
  readonly affinity:
    | "before"
    | "after"
}
```

But collaborative mode requires stable positions that survive concurrent edits.

Therefore distinguish:

```text
ResolvedPosition
    node + current offset

StablePosition
    identity capable of being resolved
    against another document version
```

The semantic APIs should leave room for both.

---

# 16. Selection

Support at least:

```text
RangeSelection
NodeSelection
```

Range:

```ts
interface RangeSelection {
  readonly anchor: Position
  readonly focus: Position
}
```

Node selection is useful for:

```text
image
embed
horizontal rule
table
custom atomic widget
```

Selection direction must be preserved.

Do not automatically normalize:

```text
anchor <= focus
```

because direction matters for browser behavior and commands.

---

# 17. Stable positions and collaboration

Collaborative cursors should not be persisted as:

```ts
{
  node: "paragraph-1",
  offset: 57,
}
```

alone.

Concurrent inserts may invalidate the intended meaning of that offset.

The collaboration engine should provide stable cursor/anchor values whose resolution changes as concurrent edits arrive.

These same stable positions can eventually support:

```text
remote cursors
comments
suggestions
annotations
bookmarks
AI citations
```

---

# 18. Three classes of Messages

This distinction is foundational.

## 18.1 Editor intent

Local user intent:

```text
InsertedTextIntent
PressedEnter
ToggledBold
Pasted
Indented
DeletedBackward
InsertedImage
```

These describe what the user is trying to do.

They are not necessarily durable.

## 18.2 Durable document change

A replayable/convergent edit:

```text
TextInserted
TextDeleted
MarkApplied
MarkRemoved
BlockSplit
BlockJoined
NodeInserted
NodeRemoved
NodeMoved
```

In collaborative mode these changes carry enough identity and causal information to retain their meaning under concurrent edits.

## 18.3 Presence

Ephemeral collaboration information:

```text
CursorMoved
SelectionChanged
TypingStarted
UserFocusedBlock
```

Presence is not document history.

It must not enter Durable.

---

# 19. Intent versus change

A user pressing Backspace does not itself belong in persisted document history.

Instead:

```text
PressedBackspace
       │
       ▼
read current selection
       │
       ▼
resolve semantic deletion
       │
       ▼
Transaction
       │
       ▼
durable change(s)
```

Likewise:

```text
PressedEnter
```

may become:

```text
SplitBlock
```

or:

```text
ExitList
```

depending on semantic context.

This keeps durable history meaningful.

---

# 20. Transactions

A Transaction groups one semantic editor action.

For example:

```ts
RichText.transaction([
  Edit.deleteRange(...),
  Edit.insertText(...),
  Edit.setSelection(...),
])
```

or:

```ts
Editor.apply(
  state,
  Transaction.make([
    Edit.addMark(...),
  ]),
)
```

A transaction returns:

```ts
{
  state,
  changeSet,
}
```

Conceptually:

```text
EditorState
    +
Transaction
    ↓
Transforms / normalization
    ↓
next EditorState
    +
ChangeSet
```

Application of a transaction is atomic: invalid operations, failed validation,
or non-terminating normalization return a diagnostic and leave the prior state
intact. Selection, stored marks, and history bookkeeping must correspond to the
same resulting document. IDs needed by operations are explicit inputs; replay
must not generate fresh IDs or read clocks.

---

# 21. Operations

The low-level semantic editing vocabulary should remain small.

Likely operations:

```text
InsertText
DeleteText

InsertNode
DeleteNode
MoveNode

SplitNode
JoinNode

SetNodeProps

AddMark
RemoveMark

SetSelection
```

Higher-level commands compile into these.

For example:

```text
ToggleBold
    ↓
AddMark / RemoveMark

Enter
    ↓
SplitNode

Backspace at beginning of paragraph
    ↓
JoinNode

Paste
    ↓
InsertNodes + marks
```

---

# 22. ChangeSet

Every transaction should produce an explicit description of what changed.

Conceptually:

```ts
interface ChangeSet {
  readonly dirtyNodes: ReadonlySet<NodeId>

  readonly insertedNodes:
    ReadonlySet<NodeId>

  readonly removedNodes:
    ReadonlySet<NodeId>

  readonly textChanged:
    ReadonlySet<TextNodeId>

  readonly structureChanged: boolean

  readonly selectionChanged: boolean
}
```

This is important for:

```text
incremental DOM reconciliation
plugins
decorations
indexing
debugging
tests
```

The DOM renderer should not rediscover all changes by diffing the entire document if the semantic transition already knows them.

A ChangeSet is an invalidation summary, not a position map or a durable change
packet. Transactions must also provide composable position mapping through every
operation and normalization step. Define offset units, boundary affinity, and
fallback positions for deleted nodes. Split, join, move, and adjacent-text merge
must preserve selection direction and map both endpoints, including endpoints
in a node whose identity normalization removes. Future collaborative anchors are
resolved by their engine, not made stable merely by applying local offset maps.

---

# 23. Transforms

Transforms normalize or derive semantic structure after edits.

Examples:

```text
merge adjacent equivalent Text nodes

remove empty mark boundaries

normalize malformed lists

turn typed URLs into Link marks

turn "# " at the beginning of a paragraph
into a Heading

turn "- " into a list

ensure an empty Document has a Paragraph
```

API concept:

```ts
const AutoLink = Transform.for(
  Text,
  node => ...
)
```

Transforms run as part of the same transaction until the affected region reaches a stable state.

Avoid:

```text
edit
render
update listener
second edit
second render
```

when one deterministic transaction can produce the canonical result.

---

# 24. Transform requirements

Transforms must be:

```text
deterministic
terminating
idempotent when applied to normalized state
limited to explicit dependencies
```

The transform engine should detect excessive normalization loops and return a diagnostic rather than spin forever.

---

# 25. Collaboration constrains transforms

A transform that emits replicated changes can be dangerous under concurrency.

Two replicas may independently decide to perform the same normalization and generate different operation identities.

Therefore collaborative transforms should preferably be one of:

```text
pure derived projection

local pre-processing before a durable change is generated

deterministic normalization whose result
does not require generating duplicate replicated operations
```

Where possible, RichText structural constraints should be **closed under concurrent merge**.

Concurrency-sensitive normalization needs explicit design rather than assuming single-user transforms will remain valid.

---

# 26. Editor Bundle

The editor itself should be a Bundle.

Conceptually:

```ts
const ArticleEditor = RichText.editor(
  "ArticleEditor",
  {
    kit: ArticleKit,
  },
)
```

Editor Bundle state may include:

```ts
interface EditorModel {
  readonly selection:
    Selection | null

  readonly storedMarks:
    ReadonlyArray<Mark>

  readonly composing:
    CompositionState | null

  readonly focused:
    boolean

  readonly history:
    History

  readonly dragging:
    DragState | null
}
```

The Bundle owns editor interaction state.

It does not need to own CMS lifecycle or networking.

---

# 27. The document and Editor Bundle

There are two useful modes.

## Standalone editor

The editor may own:

```text
Document
Selection
History
```

inside its Bundle.

Useful for:

```text
chat composer
notes
standalone editor
small embedded editor
```

## Controlled editor

The authoritative Document lives elsewhere.

The Editor Bundle receives:

```text
Document
```

and emits:

```text
Transactions / Changes
```

Useful for:

```text
Form
CMS
Sync
shared documents
```

The architecture should support both without two separate editor implementations.

Prove this before the DOM implementation. A parent reducer must apply the
transaction to its authoritative document and install the corresponding editor
interaction state in one transition. Use existing Bundle helpers and `OutMessage`
routing where they fit; the spike must show how the child reads the current
document and how the parent handles the result without a second synchronized
document copy or a delayed Command to commit half the transition. Cover parent
document replacement and rejected edits as well as ordinary typing.

---

# 28. DOM is a specialized interpreter

A rich-text editor must not treat normal Foldkit VDOM rendering as sufficient for the editable subtree.

Browsers maintain transient state around:

```text
selection
IME composition
spellcheck
autocorrect
native input behavior
clipboard
drag/drop
```

Rebuilding arbitrary editable DOM after every keystroke will fight the browser.

Therefore:

```text
RichText semantic state
        │
        ▼
foldkit-richtext-dom
        │
        ▼
owned contenteditable subtree
```

The adapter is allowed to be specialized.

---

# 29. DOM ownership

The recommended boundary is similar to the React island boundary.

Foldkit owns:

```text
editor host element
surrounding application
toolbar
menus
status UI
```

The RichText DOM adapter owns:

```text
the contenteditable subtree
```

Only Messages and semantic state cross that boundary.

No two renderers should own the same DOM subtree.

---

# 30. DOM adapter responsibilities

`foldkit-richtext-dom` needs to handle:

```text
beforeinput
input
keydown / keyup
compositionstart
compositionupdate
compositionend
selectionchange
copy
cut
paste
drag
drop
focus
blur
spellcheck/autocorrect mutations
```

It must translate browser behavior into:

```text
Editor intent
```

and semantic state back into incremental DOM updates.

---

# 31. DOM reconciliation

Pipeline:

```text
browser event
      │
      ▼
DOM adapter
      │
      ▼
Editor Message
      │
      ▼
Transaction
      │
      ▼
new semantic state
   + ChangeSet
      │
      ▼
DOM reconciler
      │
      ▼
patch dirty DOM only
      │
      ▼
restore/map selection
```

The semantic Document remains authoritative.

DOM mutation observation is recovery/input handling, not domain state.

---

# 32. Composition / IME

IME composition must be first-class editor state.

During composition:

```text
browser owns a temporary composition interaction
```

The editor must avoid aggressively reconciling that text out from under the browser.

A typical state machine might include:

```text
Idle

Composing {
  node
  range
  browser text
}
```

Only when the composition commits should the editor convert the resulting interaction into normal semantic changes.

This requires targeted browser tests, particularly on:

```text
Chrome
Safari
Firefox
Android
iOS
```

---

# 33. Read-only rendering

Editable DOM and read-only rendering need not use the same low-level renderer.

Read-only content can be rendered as ordinary Foldkit views:

```ts
RichTextView.render(
  document,
  ArticleKit,
  h,
)
```

This allows:

```text
SSR
static pages
CMS visitor rendering
email generation
React codegen where supported
```

The semantic Node renderer definitions should be reusable by both editable and read-only interpreters.

---

# 34. Rendering registry

A Kit should not store executable renderer functions in persistent content.

Runtime renderer mapping can be:

```ts
const ArticleRenderer =
  RichTextRenderer.make(ArticleKit, {
    Paragraph: ...,
    Heading: ...,
    Callout: ...,
    Image: ...,
  })
```

The Document contains:

```text
"Callout"
```

not:

```text
CalloutRenderer
```

---

# 35. Mixins

Mixins are a strong fit for rich text.

There are two layers.

## Editor chrome

Expose slots for:

```text
editor root
toolbar
toolbar group
toolbar button
active toolbar button
floating toolbar
slash menu
slash result
link popover
block handle
placeholder
status
```

## Content node rendering

Custom node renderers may expose slots.

Example:

```text
Callout

root
icon
content
```

or:

```text
Image

figure
image
caption
```

Applications can then customize both editor UI and content presentation without forking the editor.

---

# 36. Editable content and Mixins

The editable subtree is owned by the rich-text DOM interpreter.

Therefore Mixins should not cause ordinary Foldkit rendering to reach into that subtree.

Instead:

```text
Mixin Style / Behavior description
             │
             ▼
RichText renderer adapter
             │
             ▼
DOM attributes/styles/events
owned by RichText DOM
```

This preserves one DOM owner.

Read-only rendering can use ordinary SlotViews directly.

---

# 37. Custom block nodes

A rich-text document should support Notion-like structured blocks.

Examples:

```text
Callout
Image
File
Video
Table
CodeEditor
Equation
Diagram
ProductCard
Poll
Embed
```

Each remains typed semantic data.

An atom may render with:

```text
Foldkit view
Surface
Bundle
React island
```

depending on its semantics.

---

# 38. Surface-backed rich-text nodes

A custom node may represent a real application feature.

For example:

```ts
const ProductCardNode =
  RichText.embed(
    "ProductCard",
    {
      Props: Schema.Struct({
        productId: ProductId,
      }),
    },
  )
```

Renderer:

```text
ProductCardNode
      │
      ▼
ProductCard Surface
      │
      ▼
Remote Product selection
```

The rich-text document says:

```text
show product X here
```

The Surface still owns:

```text
what data is observed
what Messages may occur
```

RichText does not become another application data system.

---

# 39. Bundle-backed nodes

An embed that genuinely needs runtime state may use a Bundle.

Examples:

```text
poll
quiz
interactive diagram
calculator
accordion
```

The editor/runtime can place one child Bundle keyed by NodeId.

Conceptually:

```text
Document NodeId
      │
      ▼
Bundle.each(...)
```

The application Model remains the state owner.

Do not create:

```text
richTextNodeState:
  Record<NodeId, unknown>
```

as an opaque runtime store.

---

# 40. React-backed nodes

`foldkit-react` can adapt complex ecosystem components.

Examples:

```text
diagram editor
math editor
media picker
data visualization
custom embed
```

The RichText document remains semantic.

React remains an implementation detail of one node renderer.

---

# 41. Form integration requires one generic improvement

The current `foldkit-form` control system is optimized for:

```text
text draft
boolean draft
list draft
nested Form rows
```

Rich text needs a richer stateful control.

The correct generalization should also benefit:

```text
page composition
query builders
rule editors
date ranges
structured JSON editors
color/gradient editors
workflow editors
```

The proposed abstraction is a **Bundle-backed Form control**.

This is a lifecycle integration, not just a new draft shape. Reuse Bundle
placement for initialization Commands, child Commands, Subscriptions, managed
resources, and outputs wherever possible. Specify validation, service requirements,
view routing, reset, and removal cleanup. Current `Bundle.each` rejects managed
resources: prove repeated controls and removal before promising arbitrary Bundles
inside nested Form rows. Do not silently drop unsupported capabilities.

---

# 42. Bundle-backed Form control

Conceptually:

```ts
const RichTextInput =
  Input.bundle("RichText", {
    bundle: ArticleEditor.bundle,

    value: model =>
      ArticleEditor.document(model),

    fill: (model, document) =>
      ArticleEditor.fill(
        model,
        document,
      ),

    settled: model =>
      ArticleEditor.settled(model),

  })
```

Then:

```ts
const PostForm = Form.make(
  "PostForm",
  PostInput,
  {
    inputs: {
      body: RichTextInput,
    },
  },
)
```

This is more powerful than merely allowing an arbitrary JSON draft.

---

# 43. Form ownership

For a non-collaborative Form:

```text
Form Model
    │
    └── body control
           │
           └── RichText Editor Model
```

The RichText model remains an ordinary child state owned by the Form Model.

No hidden editor store is introduced.

Form delegates the child Bundle's Messages through its own Message union.

---

# 44. Proposed Form model extension

Conceptually:

```text
FormModel

fields:
    simple controls

rows:
    nested forms

controls:
    Bundle-backed controls
```

or another representation that preserves current compatibility.

The exact shape needs a spike.

In the existing Form API, `settled(model)` returns a resumable Model with abandoned
in-flight validation and submission cleared; it is not a readiness predicate.
Preserve that meaning for custom controls. Define fill/reset as distinct from
resume, including whether each preserves selection and history.

A Bundle-backed control must provide enough capability for Form to implement:

```text
fill
partial
submit
reset
settled
saved Model resume
validation
```

---

# 45. Form edit semantics need to become explicit

Today CMS detects Form edits partly by recognizing concrete Message tags such as:

```text
Changed
RowAdded
RowRemoved
Reset
Nested(...)
```

That will not scale to custom controls.

Form should report whether a completed transition changed authored content.
The exact result field is to be established by the stateful-control spike and
must compose with Bundle outputs and nested Forms. CMS consumes that result
rather than knowing Form's internal Message tags.

A message-only `isEdit` or classification helper may describe intent, but cannot
prove a content change: the edit may be rejected, target a missing row, or be a
no-op. Selection, focus, and validation-only updates must not schedule content
autosave. A successful document change must report one even when generated by
normalization or a child output. Define reset/fill behavior explicitly.

This is a useful architectural improvement independent of RichText.

---

# 46. CMS integration

Once RichText is a Form control, ordinary CMS content needs no RichText-specific lifecycle.

Example:

```ts
const Post = Entity.define(
  "Post",
  Schema.Struct({
    id: PostId,
    title: Schema.String,
    body:
      RichText.schema(ArticleKit),
    publishedAt:
      Schema.NullOr(Schema.String),
  }),
)
```

Then:

```ts
const PostForm = Form.make(
  "PostForm",
  PostInput,
  {
    inputs: {
      body:
        RichText.input(ArticleKit),
    },
  },
)
```

Existing `Cms.editor` then gives:

```text
autosave
draft recovery
publish
schedule
revision history
restore
conflicts
preview
```

to RichText content automatically.

That lifecycle still needs a persistence contract. Today CMS saves both
`form.partial(model)` and the encoded whole Form Model. Adding an editor would
therefore also save its interaction state and history unless the integration
explicitly changes that path. Decide which local state is worth retaining, bound
history size, exclude runtime handles, and clear composition/focus/in-flight work
on resume. Version the saved editor Model separately from published content and
test recovery from an incompatible saved Model using semantic values when valid.
Do not claim that publishing only the Document prevents transient state from
entering the saved draft Model.

---

# 47. CMS drafts versus editor history

Keep these separate.

```text
Editor undo history

    local editing interactions


CRDT operation history

    collaborative convergence


CMS revisions

    meaningful authored/published snapshots
```

One must not be used as a substitute for another.

A CMS revision may represent thousands of rich-text changes.

---

# 48. Preview

CMS preview should remain the application's actual rendering path.

```text
RichText Form draft
      │
      ▼
Cms preview overlay
      │
      ▼
normal Post Entity
      │
      ▼
normal article view
      │
      ▼
RichText read-only renderer
```

There should not be a separate CMS-specific RichText preview renderer.

---

# 49. Collaboration is a stronger form of replay

Current `foldkit-sync` is approximately:

```text
committed snapshot
      +
pending durable Messages
      ↓
replay
      ↓
visible state
```

For many Messages this works directly.

Rich text adds a stronger requirement:

> A pending change must retain its semantic meaning even when concurrent changes alter the document beneath it.

Raw positional operations such as:

```ts
InsertText({
  index: 12,
  text: "hello",
})
```

do not provide that guarantee.

---

# 50. Convergent changes

Collaborative rich-text changes need stable identity and causal semantics.

Conceptually:

```ts
interface RichTextChange {
  readonly id: ChangeId
  readonly actor: ActorId
  readonly frontier: Frontier
  readonly operations:
    ReadonlyArray<ConvergentOperation>
}
```

A text insertion may internally carry:

```text
stable neighboring identity

or

enough causal/index history
for an Eg-walker-like engine
to reconstruct the intended position
```

A style operation likewise carries identity and boundary semantics.

This information belongs below normal editor intent.

---

# 51. Two levels of replicated API

Applications should usually interact with semantic intent:

```text
InsertText
ToggleBold
SplitParagraph
MoveBlock
```

The collaboration engine produces the lower-level convergent change:

```text
RichTextChange
```

That packet is what Sync/Durable needs to preserve exactly.

Thus:

```text
local editor Message
      │
      ▼
semantic transaction
      │
      ▼
collaboration engine
      │
      ▼
RichTextChange
      │
      ▼
durable Foldkit Message
```

---

# 52. Durable Foldkit Message

A collaborative app can have an ordinary durable application Message such as:

```ts
Message.RichTextChanged({
  document: documentId,
  change: EncodedRichTextChange,
})
```

Its `update` does one deterministic thing:

```text
current replicated RichText state
      +
change
      ↓
CRDT merge/integration
      ↓
new replicated RichText state
```

That Message is:

```text
pure
serializable
replayable
idempotent by internal change identity
```

and therefore fits Sync's durable boundary much better than a browser intent Message does.

---

# 53. Current Sync can already provide much of the runtime

Existing Sync already provides:

```text
persistent local outbox
immediate optimistic application
offline survival
transport
server exchange
acknowledgements
reconciliation
checkpoint adoption
pending replay
```

Those mechanisms are highly reusable.

The major semantic difference is that the custom replay function becomes:

```text
CRDT integrate
```

rather than:

```text
ordinary sequential reducer
```

When the convergent changes are correct:

```text
merge(A, B)
```

and:

```text
merge(B, A)
```

lead to the same semantic state where causality allows either delivery order.

The server's Durable sequence remains useful for storage and transport without being interpreted as user causality.

---

# 54. Server order is not causal order

This distinction must be documented explicitly.

Durable may persist:

```text
sequence 100
    Alice change

sequence 101
    Bob change
```

That does not imply:

```text
Alice semantically happened-before Bob
```

Alice and Bob may have edited concurrently.

Therefore:

```text
Durable Sequence
    storage / retrieval order

CRDT frontier / dependencies
    causal relation

Lamport / operation identity
    conflict resolution where required
```

These are different concepts.

---

# 55. Durable needs almost no semantic change

`foldkit-durable` already provides:

```text
stable operation identity
ordered journal
idempotent append
snapshots
cursor
history reads
compaction
authorization
validation
```

That works very well for CRDT changes.

A Durable RichText snapshot must contain:

```text
the collaboration engine state needed
to merge future changes
```

not merely:

```text
rendered RichText.Document
```

A semantic Document is insufficient if required causal/tombstone/operation metadata has been discarded.

---

# 56. Replicated state versus semantic Document

Collaborative mode should distinguish:

```text
RichText.ReplicaState
    CRDT metadata
    stable ids
    causal information
    style anchors / equivalent
    merge information

RichText.Document
    clean semantic projection
```

Flow:

```text
ReplicaState
     │
     ▼
project
     │
     ▼
Document
     │
 ┌───┼──────────────┐
 ▼   ▼              ▼
DOM HTML          Markdown
```

Most application code should consume `Document`, not CRDT internals.

---

# 57. Loro backend

A pragmatic first collaboration implementation should strongly consider Loro.

Conceptually:

```text
foldkit-richtext
    semantic editor API

foldkit-richtext-loro
    convergence engine

foldkit-sync
    offline/outbox/exchange

foldkit-durable
    server journal
```

The application does not expose Loro as its editor API.

Loro is one interpreter for:

```text
stable text
rich-text marks
concurrent editing
stable cursors
```

A future Foldkit-native implementation could replace it without changing semantic editor APIs.

---

# 58. Loro state boundary

Do not allow a mutable Loro document instance to become invisible application authority.

The integration should expose a Schema-encodable collaboration state or change representation.

Possible implementation strategies should be benchmarked:

```text
encoded Loro snapshot in Model

immutable wrapper around Loro exported state

runtime cache keyed by encoded state

WASM pure-ish state transition wrapper
```

The requirement is:

> The Foldkit Model must still contain enough information to replay, restore, inspect and reproduce the visible document.

A mutable hidden singleton must not become the actual source of truth.

Move a minimal feasibility spike into Phase 1. Sync's replay callback is
synchronous and is reused for admission, committed replay, and optimistic pending
replay. Prove cold restoration, duplicate integration, checkpoint adoption with
pending changes, and projection without relying on a surviving runtime cache.
Benchmark restoration, integration, export, projection, and pending-queue replay
at explicit document/queue sizes. Resolve engine initialization and deterministic
actor/change identity before calling this a compatible replay implementation.
Retain the benchmark in the repository's benchmark infrastructure. Full
collaboration remains Phase 8; this spike gates the representation choice.

---

# 59. Potential Sync improvement: operation identity

CRDT changes often have meaningful stable identities before they reach Sync.

Current Sync creates its own stable local operation identity.

It may be useful to support:

```ts
Sync.make({
  operationId: message =>
    message.change.id,
})
```

or an equivalent hook.

This would let:

```text
CRDT change identity
```

and:

```text
Sync outbox identity
```

be one semantic identity instead of parallel ids.

This is not required for the first prototype, but should be investigated.

---

# 60. Potential Sync improvement: dependencies

There is a more important issue.

Suppose local pending changes are:

```text
A
│
▼
B
│
▼
C
```

and B references characters/nodes created by A.

If the server rejects A, current ordinary Sync semantics might remove A and replay B/C.

For a causal CRDT this may be impossible or meaningless.

Therefore convergent operations may need explicit dependency information.

Conceptually:

```ts
interface PendingOperation {
  readonly id: OpId
  readonly dependencies:
    ReadonlySet<OpId>
}
```

If operation A is rejected:

```text
A rejected
   ↓
B depends on A
   ↓
B cannot remain pending
   ↓
C depends on B
   ↓
C cannot remain pending
```

Sync may need a configurable rejection strategy:

```text
independent
cascadeDependents
custom
```

This is the most important likely Sync change for CRDT-backed collaboration.

---

# 61. Prefer avoiding document-change rejection

For real-time collaborative text, arbitrary server rejection is difficult because later local changes may depend on earlier ones.

Where possible, policy should be determined before editing:

```text
May this principal edit this document?
```

rather than:

```text
May this individual character insertion commit?
```

The server still validates:

```text
operation integrity
allowed node/mark vocabulary
maximum size
principal access
malformed change data
```

but application rules should avoid rejecting ordinary edits after long dependent offline chains.

---

# 62. Presence

Presence is not part of Sync/Durable document history.

Presence should be ephemeral:

```ts
interface Presence {
  readonly actor: ActorId
  readonly name: string
  readonly selection:
    StableSelection | null
  readonly typing: boolean
}
```

Transport:

```text
WebSocket / realtime channel
```

Recovery semantics:

```text
if packet is missed,
wait for newer presence
```

No journal replay is necessary.

Reuse `foldkit-sync`'s existing `PresenceChannel`, `createPresence`, socket
channels, and server-stamped peer identity. The RichText integration supplies
validated stable-selection payloads, document/session scoping, refresh/leave
lifecycle, and decoration projection. It must not create another presence
transport or put presence into the durable Message subset.

---

# 63. Remote selections

Remote selections use stable positions.

Flow:

```text
remote presence
      │
      ▼
stable selection
      │
      ▼
resolve against local ReplicaState
      │
      ▼
Decoration
      │
      ▼
DOM renderer
```

Presence never mutates the RichText Document.

---

# 64. Decorations

Introduce a derived Decoration layer for non-document visuals.

Examples:

```text
remote cursors
remote selections
spellcheck
search matches
lint warnings
AI suggestions
comment highlights
temporary composition ranges
```

A Decoration is not content.

It should not serialize with the Document unless explicitly converted into a semantic annotation.

---

# 65. Undo and redo

Single-user undo may be implemented using:

```text
Transactions
inverse Transactions
or snapshots
```

Evaluate `foldkit-primitives/state` history before implementing another snapshot
stack. It owns `past`, `present`, and `future`; use it only if `present` is the
authoritative document, rather than mirroring an independently owned document.
Transaction grouping and selection restoration still need explicit semantics.

Collaborative undo is different.

Do not implement collaborative undo as:

```text
go back to old document snapshot
```

because that would erase other users' work.

Collaborative undo should generate a new semantic/convergent change that reverses the local user's earlier change while preserving concurrent edits.

History should therefore support grouping:

```text
typing burst
paste
format toggle
block move
```

into meaningful undo units.

---

# 66. Undo history is local

Undo stack state is generally local editor state.

The generated inverse change is durable.

```text
local undo stack
      │
      ▼
Undo requested
      │
      ▼
inverse transaction
      │
      ▼
new convergent change
      │
      ▼
Sync / Durable
```

The stack itself need not be synchronized.

---

# 67. Agent integration

Agents should operate on semantic editor capabilities.

Good tools:

```text
insert_text
replace_selection
insert_heading
insert_callout
toggle_mark
move_block
summarize_selection
```

Bad tool:

```text
submit_raw_crdt_bytes
```

Flow:

```text
Agent
   │
   ▼
semantic editor intent
   │
   ▼
Transaction
   │
   ▼
same change generation path
used by a human
```

The collaboration packet remains infrastructure.

---

# 68. Slash commands

Slash commands become another producer of editor intents.

```text
"/heading"
      │
      ▼
ConvertBlock(Heading)

"/image"
      │
      ▼
InsertNode(Image)

"/product"
      │
      ▼
InsertNode(ProductCard)
```

The command palette itself can be a Bundle or ordinary local Model state.

---

# 69. Clipboard

Clipboard conversion should be an interpreter boundary.

Support:

```text
RichText slice
HTML
plain text
possibly Markdown
```

Copy:

```text
Document Selection
      │
      ├── RichText encoded slice
      ├── HTML
      └── plain text
```

Paste resolution priority could be:

```text
native RichText slice
HTML
plain text
```

Applications should be able to customize sanitization and allowed nodes.

---

# 70. HTML import/export

HTML is an interchange format, not the document model.

Each Node/Mark renderer may optionally contribute:

```text
toHtml
fromHtml
```

or use centralized interpreters.

Import must be constrained by the Kit.

Unknown or unsafe HTML must not become executable content.

---

# 71. Markdown

Markdown should similarly be an interpreter.

Not every RichText Kit is representable losslessly as Markdown.

Therefore conversion should produce diagnostics for unsupported semantics rather than silently discard rich content.

---

# 72. Unknown nodes and migrations

Persistent RichText documents need the same resilience as Composition Documents.

If an application deployment no longer has a custom node implementation, it must not silently destroy that content.

Possible recovery form:

```text
UnknownNode {
  originalType
  encodedProps
  children
}
```

The read-only renderer can show a diagnostic placeholder.

The editor can preserve the data until migration becomes available.

Separate lossless loading from editability and publish validation. Validate the
versioned envelope, identities, bounded structure, and JSON-safe opaque payloads
before preserving unknown extensions. Unavailable nodes/marks retain their type,
version, props, and children; they do not execute or silently disappear. Define
whether their subtree is read-only and require an explicit migration or removal
before any publishing policy that forbids unknown extensions can pass. Unsupported
document-envelope versions need an explicit failure/recovery path rather than
being treated as an unknown node.

---

# 73. Versioning

Document format and extension versions must be explicit.

Conceptually:

```ts
interface Document {
  readonly version: number
  ...
}
```

Node definitions may contribute migrations.

Examples:

```text
Callout.tone
    "danger"
        →
    "critical"

Image.src
        →
Image.assetId

OldEmbed
        →
ProductCard
```

Migration operates on semantic data, not DOM.

---

# 74. Inspection

Provide deterministic inspection.

```ts
RichText.inspect(document)
RichText.describe(document)
Kit.inspect(ArticleKit)
```

Useful structural data:

```text
node types
mark types
node count
text length
tree depth
unknown nodes
active extensions
validation diagnostics
collaboration state summary
```

This can feed:

```text
DevTools
tests
agent context
docs
CI
migration tools
```

---

# 75. Validation

Validation should check:

```text
known node types
known marks
props decode
allowed child structure
stable node identity
no illegal cycles
valid text nodes
mark props
selection resolution
maximum document constraints
```

Collaborative state has additional invariants:

```text
operation identity uniqueness
valid causal dependencies
valid stable references
engine-specific structural validity
```

---

# 76. Security

RichText persistent content is untrusted data.

It must not contain executable functions.

Custom nodes reference implementations registered in application code.

Links, embeds and imported HTML require normal application sanitization and policy.

Agent tools operate through explicit semantic capabilities.

Server authorization remains server-side.

---

# 77. Performance requirements

A serious editor should target:

```text
large documents
incremental typing
large paste
many formatting spans
thousands of nodes
collaborative history
remote changes
```

Important techniques:

```text
stable node identity
dirty-node ChangeSet
incremental DOM reconciliation
text structure optimized beyond repeated JS string copying
lazy/targeted projections
batched Transactions
```

Do not optimize by hiding mutable authoritative state outside Model boundaries.

---

# 78. Potential text storage evolution

The initial single-user semantic Document may use straightforward strings.

A large collaborative implementation may need a richer internal representation:

```text
rope
piece table
B-tree
CRDT sequence tree
```

This belongs in `ReplicaState` / editor internals.

The application-facing semantic projection can remain:

```text
Text("hello")
```

The public API should not expose a storage data structure prematurely.

---

# 79. Testing strategy

RichText needs substantially more adversarial testing than an ordinary UI package.

Required categories:

```text
unit tests
transaction law tests
normalization tests
DOM/browser tests
IME tests
clipboard tests
selection tests
serialization round trips
migration tests
collaboration tests
fuzzing
```

CRDT integration should run randomized multi-replica histories.

---

# 80. Collaboration laws

For a set of valid concurrent changes, test:

```text
replica A integrates:
    X, Y, Z

replica B integrates:
    Z, X, Y

replica C integrates:
    Y, Z, X
```

after respecting causal prerequisites.

All must eventually produce equivalent:

```text
ReplicaState semantics
Document projection
```

This should be a property/fuzz test, not merely example tests.

---

# 81. Rich-text merge tests

Include Peritext-style cases:

```text
concurrent formatting + insertion

overlapping bold ranges

bold versus unbold

link boundary insertion

bold boundary insertion

overlapping comments

concurrent delete + format

concurrent insert at same position
```

Also test custom Nodes under concurrency.

---

# 82. Browser test matrix

At minimum:

```text
Chrome

Firefox

Safari
```

and eventually:

```text
iOS Safari

Android Chrome
```

Focus especially on:

```text
composition
autocorrect
selection restoration
paste
undo interaction
mobile virtual keyboards
```

---

# 83. Changes to `foldkit-form`

Recommended additions:

```text
Bundle-backed / stateful controls

custom Draft Models

Form-level delegation of child Messages

transition-level authored-content change reporting

fill / partial / settled support
for stateful controls

FormView renderer support for
stateful control views
```

Do not special-case RichText inside Form.

---

# 84. Changes to `foldkit-cms`

Small but important:

Replace knowledge such as:

```text
Changed
RowAdded
RowRemoved
Nested
```

with:

the Form transition's authored-content change result (§45).

CMS should ask the Form whether a Message changed authored content.

No RichText-specific CMS API is necessary for ordinary single-author editing.

Collaborative CMS authoring should be treated as a later integration problem rather than forcing CRDT semantics into the existing draft lifecycle immediately.

---

# 85. Changes to `foldkit-bundle`

None required initially.

Bundle already gives the desired ownership model for:

```text
editor state
toolbars
menus
stateful embedded nodes
```

If stateful custom Form controls expose a recurring pattern, a tiny Bundle/Form helper may emerge, but Bundle core should not learn about forms.

---

# 86. Changes to `foldkit-mixins`

None required.

Add a RichText integration package defining:

```text
editor chrome Slot contracts

default Styles

default Behaviors

node renderer adapters
```

Do not introduce rich-text concepts into Mixins core.

---

# 87. Changes to `foldkit-surface`

None initially.

Surfaces already provide the correct boundary for application-backed custom nodes.

A future helper such as:

```ts
RichTextNode.fromSurface(...)
```

belongs with RichText integration, not Surface core.

---

# 88. Changes to `foldkit-sync`

A basic CRDT-backed experiment may already work through a custom replay function and a durable `RichTextChanged` Message.

Two improvements should be investigated:

```text
1. Custom semantic operation identity

2. Operation dependency metadata +
   dependency-aware rejection
```

The second is especially important for offline causal change chains.

Do not turn ordinary Sync into a CRDT runtime.

The existing server-authoritative replay mode remains valuable and conceptually distinct.

---

# 89. Changes to `foldkit-durable`

No fundamental semantic change required.

Document explicitly that a custom convergent reducer may use:

```text
server Sequence
```

as storage/retrieval order while causal semantics live inside operations.

Ensure checkpoint/snapshot APIs can store encoded collaboration state containing all information needed to accept future changes.

Durable's existing operation identity, snapshots, history and compaction remain valuable.

---

# 90. Changes to `foldkit-agent`

None required initially.

An application can expose editor intent Messages using the current Agent machinery.

If Composition and RichText both end up defining the same:

```text
typed input
description
to existing Message
```

capability pattern, extract the common primitive only after those two real consumers prove it.

---

# 91. Non-goal: clone Lexical's API

Lexical is valuable prior art, not an API template.

Do not copy:

```text
plugins
commands
nodes
editor.update
```

mechanically.

Translate the useful underlying ideas into Foldkit's existing vocabulary:

```text
Lexical-like concept      Foldkit-native expression

editor state              typed Model/data

command                   Message / editor intent

plugin state              Bundle / explicit integration

node renderer             interpreter / view

node transform            Transform

editor listener           Projection / explicit output

collaboration             Sync / convergent engine

UI plugin                  Bundle / Mixins
```

---

# 92. Non-goal: make the DOM authoritative

Reject:

```text
read innerHTML
parse it
save it
```

as the editor architecture.

DOM exists to provide browser interaction and rendering.

Semantic RichText state remains authoritative.

---

# 93. Non-goal: store rendered HTML

Published content should store the semantic document.

HTML can always be rendered from it.

Stored HTML cannot cleanly recover:

```text
custom semantic nodes
agent structure
migration
alternate renderers
typed annotations
application-backed embeds
```

---

# 94. Non-goal: Sync every UI Message

Do not mark:

```text
PressedArrowLeft
SelectionChanged
ToolbarOpened
HoveredLink
```

as durable.

Only document changes belong in document replication.

Presence gets its own ephemeral transport.

---

# 95. Non-goal: Sync whole documents per keystroke

Reject:

```ts
DocumentChanged({
  document: entireDocument,
})
```

as the collaborative operation format.

Replication should carry semantic/convergent changes.

Snapshots exist for recovery and compaction, not every keystroke.

---

# 96. Non-goal: assume sequential replay is sufficient for collaboration

This:

```text
A then B
```

is not enough to model:

```text
A concurrent with B
```

Causal semantics need to remain available even if Durable assigned one physical storage order.

---

# 97. Non-goal: make CMS revisions the CRDT log

CMS revisions answer:

> What meaningful authored/published version existed?

CRDT history answers:

> Which collaborative operations happened?

Do not merge them.

---

# 98. Initial API sketch

A basic editor might eventually look like:

```ts
const ArticleKit = RichText.kit({
  nodes: [
    RichText.Paragraph,
    RichText.Heading,
    RichText.Quote,
    Callout,
    Image,
  ],

  marks: [
    RichText.Bold,
    RichText.Italic,
    RichText.Link,
  ],
})

const ArticleEditor =
  RichText.editor(
    "ArticleEditor",
    {
      kit: ArticleKit,
    },
  )
```

Read-only:

```ts
RichTextView.render(
  ArticleKit,
  document,
  h,
)
```

Form:

```ts
const PostForm = Form.make(
  "PostForm",
  PostInput,
  {
    inputs: {
      body:
        RichText.input(
          ArticleEditor,
        ),
    },
  },
)
```

---

# 99. Collaborative API sketch

Application Message:

```ts
const Message =
  defineMessageUnion({
    RichTextChanged: {
      document: DocumentId,
      change:
        RichText.Collaboration.Change,
    },

    SelectionChanged: {
      selection:
        RichText.Selection,
    },
  })
```

Update:

```ts
RichTextChanged:
  ({ change }) =>
    ({
      model:
        applyRichTextChange(
          model,
          change,
        ),
    })
```

Sync:

```ts
const ArticleSync =
  Sync.forApplication(App).make({
    documentId,

    shared:
      App.fields.article
        .richTextReplica,

    durable:
      MessageSet.make(App, [
        Message.RichTextChanged,
      ]),
  })
```

The exact shape depends on the collaboration engine spike.

---

# 100. Loro-backed architecture sketch

```text
DOM input
    │
    ▼
Editor intent
    │
    ▼
RichText semantic transaction
    │
    ▼
Loro adapter
    │
    ├── next ReplicaState
    │
    └── encoded Loro change
              │
              ▼
     Message.RichTextChanged
              │
              ▼
         foldkit-sync
              │
              ▼
        foldkit-durable
              │
              ▼
       other replicas
```

Remote integration:

```text
encoded change
      │
      ▼
Loro merge
      │
      ▼
ReplicaState
      │
      ▼
RichText.Document projection
      │
      ▼
DOM reconciliation
```

---

# 101. Phase 1 — pure semantics and integration feasibility

Implemented first slice: `packages/richtext` has a fixed initial vocabulary
(paragraphs, headings, text, Bold/Italic/Code), versioned document validation,
explicit NodeIds and named Node references, range/node selections, inspection, and atomic
InsertText/DeleteText/SetSelection transactions with UTF-16 position maps.
Unknown extensions are currently rejected, not losslessly loaded. ChangeSet
currently summarizes touched text nodes and their parent blocks; structural
fields arrive with structural operations. This is not completion of Phase 1.

Remaining: extensible Kits and metadata, mark definitions and boundary semantics,
structural operations and their position maps, transforms/normalization, bounded
validation and unknown-extension preservation, followed by all three feasibility
proofs below. The current implementation is private/unpublished and APIs may change
as those proofs establish the final contracts.

Implement only:

```text
Document
NodeId
Paragraph
Heading
Text
basic Marks
Kit
Selection
Position mapping
Transaction
Operations
Transforms
ChangeSet
validation
inspection
```

No DOM editor yet.

Semantic tests operate entirely on values. Include transaction rollback,
normalization termination/idempotence, position mapping through splits/joins/
deletions/merges, selection direction, codec round trips, and unknown-extension
preservation versus edit/publish validation.

Before Phase 2, complete three bounded feasibility proofs:

1. Controlled Bundle: one parent transition commits document and interaction
   state, including rejection and external document replacement (§27).
2. Stateful Form: one non-RichText control proves child Commands, subscriptions,
   outputs, validation, repeated placement/removal, resource restrictions, and
   save/resume semantics (§41–45). Establish content-change reporting here.
3. Collaboration: synchronous replay over reconstructible state, checkpoint plus
   pending replay, and retained cold/warm benchmarks (§58). Do not implement a
   production adapter yet.

Record results and unresolved constraints before freezing public APIs. Phase 1
is complete only when these ownership and representation questions have answers.

---

# 102. Phase 2 — read-only renderer

Implement a normal Foldkit renderer.

Prove:

```text
Document
    ↓
Foldkit Html
```

with custom Nodes and Marks.

Add HTML/plain-text serialization.

---

# 103. Phase 3 — basic DOM editor

Add `foldkit-richtext-dom`.

Support:

```text
typing
selection
Enter
Backspace/Delete
basic bold/italic
copy/paste
focus
```

Use a specialized owned DOM subtree.

Use the controlled/standalone Bundle transition path proven in Phase 1 and its
position maps. The minimal Bundle is a prerequisite here; Phase 4 adds editor
features rather than introducing ownership after browser editing already works.

No collaboration.

---

# 104. Phase 4 — editor Bundle features

Add:

```text
selection state
stored marks
history
keymaps
toolbar integration
slash commands
```

Prove editor interaction remains ordinary Foldkit Messages and Model.

---

# 105. Phase 5 — stateful Form controls

Generalize `foldkit-form`.

Build on the non-RichText control proof from Phase 1 and complete its public API,
renderer integration, lifecycle support, and persistence/resume coverage.

Then integrate RichText.

Update CMS to use:

the Form transition's authored-content change result, with tests that selection,
validation, rejected edits, and no-ops do not trigger content autosave.

---

# 106. Phase 6 — CMS example

Add a rich-text article to `examples/cms`.

Demonstrate:

```text
type article

autosave

reload

resume editor Model

preview

publish

visitor rendering

restore revision

schedule publication
```

No collaboration yet.

---

# 107. Phase 7 — richer Nodes

Add:

```text
lists
links
quotes
code
image
callout
mentions
custom embeds
```

Prove:

```text
Surface-backed node
React-backed node
```

without changing core document semantics.

---

# 108. Phase 8 — Loro collaboration spike

Extend the Phase 1 feasibility proof into an editor adapter; retain its cold-state
replay and checkpoint tests. Revisit the backend choice if that proof failed.

Implement a minimal adapter for:

```text
plain text
bold
link
stable selections
```

Do not attempt all custom nodes yet.

Test:

```text
two offline replicas
concurrent insertions
concurrent formatting
reconnect
eventual convergence
```

---

# 109. Phase 9 — Sync/Durable integration

Wrap convergent change packets in a durable application Message.

Use existing:

```text
Sync outbox
Durable journal
checkpoint
replay
```

Measure whether current custom replay support is sufficient.

Only then decide whether Sync needs:

```text
custom op identity
dependencies
cascading rejection
```

---

# 110. Phase 10 — collaborative structured nodes

Extend collaboration beyond a single rich text sequence.

Investigate representation of block structure using:

```text
CRDT lists
maps
movable trees
```

This is also where knowledge gained from collaborative Page Composition may become reusable.

---

# 111. Phase 11 — presence

Build on Sync's existing ephemeral presence channel and lifecycle (§62).

Add:

```text
ephemeral remote presence
stable remote selections
cursor decorations
user colors/names
```

Keep it explicitly outside Durable.

---

# 112. Phase 12 — AI editor capabilities

Expose semantic editor intents to Agent.

Prove AI and human editing use the same transaction path.

Example:

```text
"Turn this paragraph into a callout
 and bold the first sentence."
```

should become semantic editor operations, not HTML rewriting.

---

# 113. Architectural success criteria

The system is successful if all of these remain true:

```text
RichText content is typed semantic data.

DOM is not authoritative.

Every edit has explicit semantic meaning.

The editor is ordinary Foldkit state machinery.

Complex controls use Bundle rather than hidden stores.

CMS does not know what RichText is.

Mixins does not know what RichText is.

Surface does not know what RichText is.

Sync does not become a text editor.

Durable does not become a CRDT implementation.

CRDT internals do not leak into application rendering.

Agents operate semantic editor capabilities.

Custom nodes remain ordinary application integrations.

Single-user and collaborative editing share one semantic editor API.
```

---

# 114. Final mental model

```text
                          RichText Kit
                     semantic vocabulary
                              │
                              ▼
                       RichText Document
                              │
                              ▼
                     semantic Transactions
                              │
              ┌───────────────┼─────────────────┐
              │               │                 │
              ▼               ▼                 ▼
          local editor     AI editor       collaboration
              │               │                 │
              └───────────────┼─────────────────┘
                              ▼
                        document changes
                              │
                  ┌───────────┼────────────┐
                  │           │            │
                  ▼           ▼            ▼
                Form        Sync        serialization
                  │           │
                  ▼           ▼
                 CMS       Durable
                  │
                  ▼
              application
                 view
                  │
                  ▼
             RichText renderer
                  │
           ┌──────┴──────┐
           ▼             ▼
      read-only DOM   editable DOM
                       interpreter
```

Or in one sentence:

> **Foldkit Rich Text is a typed semantic document edited through explicit Messages and Transactions, rendered through interpreters, composed through Bundle and Mixins, authored through Form/CMS, and made collaborative by strengthening durable changes with convergent identity and causal semantics.**

That should be the constraint against which every API decision is evaluated.
