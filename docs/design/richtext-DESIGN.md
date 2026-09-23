# Foldkit Plus Rich Text

**Status:** Phase 1 is implemented except for nested children beyond runs, marks with props, metadata keys, and collaboration. Phases 2 and 3 have private harness increments (`examples/richtext`: the read-only Foldkit renderer, HTML import/export, and the DOM editing loop, including stored marks) that are spikes, not supported API. Phase 4 onwards is not started. The three integration proofs stand as recorded in §101: the controlled-Bundle proof passed, the stateful-Form control is spiked, and the collaboration proof is unstarted. §115 is the full remaining inventory.
**Target:** `doeixd/foldkit-plus`
**Primary new packages:** `foldkit-richtext`, `foldkit-richtext-dom`
**Likely integration packages:** `foldkit-mixins-richtext`, `foldkit-richtext-loro` / `foldkit-richtext-sync`
**Existing packages affected:** `foldkit-form`, `foldkit-cms`, potentially `foldkit-sync`
**Prior art:** Lexical, Loro Rich Text, Peritext, Fugue, Eg-walker, Yjs
**Goal:** Build a Lexical-class rich-text and structured-content editor whose document model, editing operations, rendering, collaboration, CMS integration, extensibility, and agent capabilities fit Foldkit's existing architecture instead of introducing a second state/runtime framework.

## Implementation entry point

Start with Phase 1 (§101): semantic documents, atomic transactions, and position
mapping, then prove the model against a private vertical editing slice as early
as possible (Phase 3): typing, selection, bold boundaries, split/join, IME, and
local undo over two paragraphs. The browser teaches things about the semantic
model that diagrams do not, so the slice must not wait for the integration
proofs. Those proofs run in parallel and gate promotion, not discovery: the
controlled-Bundle proof gates the supported editor (Phase 4), the stateful Form
control proof gates Form integration (Phase 5), and the collaboration replay
proof gates the Loro adapter (Phase 8). Keep every API private until its gate
is met.

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
Annotation
Selection
Position
Range
Kit
Transaction
Command
Edit
Transform
ChangeSet
Decoration contracts
validation
normalization
serialization abstractions
document inspection
```

The DOM adapter owns decoration *rendering*; the abstract Decoration contracts
(project, display, discard — never persist) belong here so other interpreters
can reuse them.

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

Text-run identities are document-local and representational, not durable
entities. Splitting `Text("hello world")` for bold and merging it back on
unbold necessarily retires one run's identity; nothing semantic is lost because
positions map through the merge (§22). The rules are: normalization merge keeps
the first run's id and retires the second; position maps cover every endpoint
in a retired run; and a reference to a retired run id resolves to absence. Hold
block ids for durable addressing. Stable cross-version anchors — the thing a
comment or a collaborator's cursor needs — belong to the replica backend
(§51), not to run ids. `NodeId` stays a single brand for blocks and runs so
that positions remain uniform; split it only when Annotation definitions demand
distinctly-typed anchors.

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

**Implemented (first slice).** A `Node` block carries `kind`, JSON `props`, and
text-run `children`; a Kit declares the kind with `RichText.node(name, { Props })`
and `validate` reports `UnsupportedNode` for an undeclared kind and
`InvalidProps` when the schema refuses the props — so the codec stays
application-agnostic and the Kit is where an application's types meet persisted
data. Because children are runs, positions, every operation, selection,
clipboard slices, history, and both interpreters work on a node block
unchanged, and a split keeps its kind and props on both halves. `data-node` is
the default rendering until a Kit renderer replaces it.

Not yet: nested children beyond runs (`blockContent`), `atom`'s no-children
enforcement at the operation level, renderers per kind, and metadata.

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
```

Comments, suggestions, citations, and entities are not marks; they are
Annotations with identity and lifecycle (§11) and do not belong in this list.

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

That distinction belongs in mark semantics, not ad hoc DOM code. The fixed
vocabulary implements it: `Bold`/`Italic` expand `after`, `Code` expands
`none`, and `resolveInsertion` retargets edge insertions per these rules
(refusing mark swaps at mixed edges). Unknown marks default to `both`. The
registry, custom marks, and overlap rules remain Kit work.

**Implemented (policy, not yet authoring).** A mark is a `MarkDef`
(`{ name, expand }`) made with `RichText.mark(name, expand?)`, and a Kit carries
the definitions, so an editor tunes its own vocabulary:

```ts
RichText.kit({ nodes: [...], marks: [Bold, Italic, mark('Link', 'none')] })
RichText.run(state, command, ids, { marks: markRegistry(kit.marks) })
```

`resolveInsertion` takes the registry, so the rule is unchanged but which marks
it applies to is the application's. A mark no registry declares expands `both`,
which keeps preservation from retargeting it away. Still to come: mark props
(a `Link` with an `href`), which is what makes custom mark *authoring* possible —
today `Edit.addMark` accepts only the shipped marks, so a registry tunes policy
rather than adding vocabulary.

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

The deeper point is that these are not all the same kind of thing. There are
three kinds with different lifetimes:

```text
Mark        content formatting (Bold, Italic, Code, Link)
            persists as document content

Annotation  persistent anchored metadata (Comment, Suggestion,
            Citation, Entity) with identity, stable range anchors,
            and lifecycle (resolve, reply, delete)

Decoration  ephemeral derived presentation (search matches,
            remote selections, spellcheck, lint, AI suggestions)
            computed from state, never persisted
```

Comments especially are not formatting that happens to occupy a range; they are
anchored metadata with their own lifecycle. Under collaboration an annotation
needs identity plus stable range anchors plus metadata, while Bold needs only
formatting semantics. Folding all three into Mark turns it into an
everything-bagel abstraction.

Until Kit-era Annotation definitions exist, overlapping comments may use
semantic mark identity as the interim representation:

```text
comment:123
comment:456
```

This lets:

```text
comment A
     ───────────

       ───────────
       comment B
```

coexist over overlapping text. The interim representation must not grow
lifecycle features (resolve/reply); those wait for first-class Annotations
anchored to stable positions (§17), resolved by the replica backend (§51).

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
  ],

  // Future API: first-class annotations with identity, anchors, lifecycle.
  annotations: [
    Comment,
    Suggestion,
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

Terminology for the rest of the document: an *intent* is the UI-level event
(`PressedEnter`); a *command* is the resolved semantic operation (`SplitBlock`,
`ToggleBold`, `DeleteRange`). Commands are what backends execute (§51): the
local backend compiles them to positional Transactions, the replica backend to
convergent changes. Validation lives with the command, not the backend.

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

This section describes the local backend's execution language. Commands reach
it as §51 describes; the replica backend executes the same commands
differently.

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
fallback positions for deleted nodes. The implemented rule: positions in removed
runs collapse to offset 0 of the first surviving run at or after the removed
index (wrapping to the document start), preserving affinity; with no runs left,
the selection clears and no collapse step is emitted. Split, join, move, and adjacent-text merge
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

Merging adjacent equivalent Text nodes keeps the first run's identity and
retires the second (§7); the merge step maps accordingly. This rule is
implemented as `apply`'s closing pass over touched blocks; the general
transform registry is still pending.

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

**Implemented.** `Transform` is `{ name, apply(document, { dirtyNodes, pass }) }`
returning `{ document, steps, removedNodes, dirtyNodes, textChanged }`, and
`apply(state, transaction, transforms)` folds each report into the same
ChangeSet and position map, mapping the selection through the transform's steps.
`mergeAdjacentRuns` is the first shipped transform (`defaultTransforms`); a
caller may pass its own registry instead. The loop settles when a pass changes
nothing and refuses after `MAX_NORMALIZATION_PASSES` with the
`UnstableNormalization` diagnostic, so a transform that never settles is a
refusal rather than a hang.

Two constraints the interface makes explicit, both from replay and from
positions: a transform may merge, move, or remove but **never mint** an identity
(so "ensure an empty Document has a Paragraph" belongs to a command that mints,
not to a transform), and a transform that removes a run positions address must
report a step out of it or the selection is left dangling. `dirtyNodes` in the
context is how a transform stays incremental: the shipped merge touches only the
blocks the transaction did.

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

Prove this before promoting the DOM spike to a supported editor (Phase 4), not
before building the spike itself. A parent reducer must apply the
transaction to its authoritative document and install the corresponding editor
interaction state in one transition. Use existing Bundle helpers and `OutMessage`
routing where they fit; the spike must show how the child reads the current
document and how the parent handles the result without a second synchronized
document copy or a delayed Command to commit half the transition. Cover parent
document replacement and rejected edits as well as ordinary typing.

**Proof result (track 1, `examples/richtext`).** The controlled mode works with
the current Bundle machinery, and the shape that makes it work is:

```text
Link.read  parent → { document, selection, nextId }   (document read, not owned)
Link.write (parent, child) → parent with interaction state only
OutMessage Edited { state } | Rejected { error }
onOut      commits state.document and state.selection in the same transition
```

`foldChildStep` runs `onOut` with the child already written back, so one parent
transition commits the document and the interaction state together; nothing
needs a Command. The child stores no document: `read` re-projects it on every
transition, so a document replaced from outside (a remote update, a CMS
restore) is what the next command resolves against. Identity comes from the
parent-owned `nextId` counter, and a refused command leaves document,
selection, and the counter untouched — so rejected edits never burn identities.

Still unproven by this track: the browser half (patching a real
`contenteditable` from the same transition) and lifecycle beyond a single
placement. Both belong to the Phase 3 slice.

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

This is an exit criterion for the Phase 3 vertical slice, not a later
hardening step: IME is the sharpest test of the DOM ownership boundary
(§§28–29), because it forces the architecture to answer what happens while the
browser temporarily knows something the semantic model does not.

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

**Implemented in the harness (`examples/richtext/src/view.ts`).**
`renderDocument(document)` and `renderBlocks(blocks)` build ordinary Foldkit
`Html` through `inertHtml`, so the read-only path dispatches nothing and owns no
DOM: blocks become `p`/`h1`–`h6`, marks nest as `strong`/`em`/`code` in the same
order the HTML serializer uses, unknown marks ride on a `span` with
`data-marks`, and unknown blocks render as an inert
`div data-unknown="Type"` placeholder. It renders a slice as well as a document,
so a preview and a copy share one interpreter. The editable adapter's element
and attribute names match it, which is what lets one stylesheet serve both.

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

**Spike result (track 2, `examples/form`).** A non-RichText stateful control
(a colour picker with a popover, a palette-lookup Command, a keyboard
Subscription, and a Managed Resource) works as a Bundle and under a plain
parent: `Bundle.at` carries its Model, Messages, Commands, Subscriptions, and
Resources, which is exactly the mechanism Form would have to use. What the
current Form API cannot carry, with the evidence recorded in that harness:

```text
a draft that is a child Model   Draft is string | boolean | string[]; a key's
                                field is { _tag, value } and nothing else
the control's Messages          the form's Message union is fixed; nothing
                                routes a control's own intents
the control's Commands          lifted only for validation and submit today
the control's Subscriptions     the form's bundle declares none
the control's Resources         the form's bundle declares none
placement per key               a key's state is plain data in `fields`
fill / partial / settled        expressed over drafts, not over a child Model
```

The shape it points at:

```ts
const ColorInput = Input.bundle('ColorPicker', {
  bundle: ColorPicker,
  value: model => model.hex,                 // what the key holds and submits
  fill: (model, hex) => ({ ...model, hex }), // a value the form was given
  settled: model => ({ ...model, open: false }), // in-flight work cleared
})
```

Constraints already known: `Bundle.each` refuses Managed Resources, so a
stateful control inside a repeated row needs no Resource or per-row keying that
Bundle does not yet support; validation still runs on `value(model)`, so the
key's schema and checks keep their meaning; and a resumed draft would restore
the control's state through the encoded Form Model, which needs an explicit
decision about what is worth keeping and what is cleared.

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

**Implemented as a model comparison, not a result field.**
`Form.authoredChanged(before, after)` compares the two Models: the draft value
inside each field's validation state, the row sequence by id, and each nested
row through that form's own `authoredChanged`. Validation state, search text,
the edited subject, and row bookkeeping are not authored content, so a blur, a
refusal, or a repeated value reports `false` and a changed draft, an added or
removed row, or a changed row reports `true`.

A result field on the update return was rejected because Foldkit's
`Update.ReturnWithOutMessage` is a fixed shape: widening it for one package
would change every Submodel fold. Comparing the two Models needs no such change,
composes with nested forms by recursion, and composes with a Bundle-backed
control for the same reason it works at all — the child is written back into the
Model before the question is asked.

`Cms.editor` now asks the form instead of recognizing tags: `isEdit(message)`
is gone, and a test pins both directions (a blur or a repeated value starts no
save; a real edit does). What remains from this section is the *stateful control
itself* — a Bundle-backed `Input` kind with Commands, subscriptions, resources,
validation, and save/resume — which is track 2 and still unbuilt.

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

Applications should usually interact with semantic commands:

```text
InsertText
ToggleBold
SplitParagraph
MoveBlock
```

A command's observable semantics and semantic validation rules are shared. Its execution
is not: each command runs against one of two backends.

```text
semantic command
      ├── local backend → positional operations
      │
      └── replica backend → convergent operations (RichTextChange)
```

Both backends project the same observable result, but they do not return the
same thing. The semantic projection is common; the authoritative backend state
and the emitted artifacts are backend-specific:

```ts
interface EditResult {
  readonly document: Document
  readonly changeSet: ChangeSet
}

interface LocalEditResult extends EditResult {
  readonly state: EditorState
}

interface ReplicaEditResult extends EditResult {
  readonly replica: ReplicaState
  readonly change: RichTextChange
}
```

```text
               shared observable result
                 Document + ChangeSet
                           ▲
                 ┌─────────┴─────────┐
                 │                   │
           local result        replica result
           EditorState         ReplicaState
                               RichTextChange
```

Do not force one generic result type to hide this: a collaborative edit that
produces no `RichTextChange` has produced nothing durable, and a local edit
has no replica state to return.

Validation likewise splits in two, and only the first half is shared:

```text
Semantic validation (command layer, shared)
    "Can Heading exist here?"
    "Can Bold apply to this selection?"
    "Is this node allowed by the Kit?"

Backend/admission validation (backend-specific)
    "Does this stable anchor still resolve?"
    "Have these causal dependencies been integrated?"
    "Is this CRDT change already known?"
```

Keep anchor resolution, dependency checks, and idempotency below the backend
boundary. A later implementer must never try to answer "does this anchor still
resolve?" at the command layer, where convergent state is invisible.

The convergent packet is what Sync/Durable needs to preserve exactly. The
positional Transaction is the local backend's execution language, not an
interchange format: positional operations cannot retain their meaning under
concurrent edits (§49), so a replica backend must execute the command directly
against stable anchors rather than convert a positional Transaction after the
fact.

Thus:

```text
local editor Message
      │
      ▼
semantic command
      ├── local backend → positional operations → Model
      │
      └── replica backend → RichTextChange → durable Foldkit Message
```

Single-user and collaborative editing share one semantic command API. They do
not share one low-level execution representation.

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

The change packet originates in the replica backend's execution of the command,
never by converting a positional Transaction. Validation of the command's
semantics is shared between backends; only the execution representation differs.

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

Run a minimal feasibility spike on the Phase 8 track, in parallel with the
vertical editing slice rather than inside Phase 1. Sync's replay callback is
synchronous and is reused for admission, committed replay, and optimistic pending
replay. Prove cold restoration, duplicate integration, checkpoint adoption with
pending changes, and projection without relying on a surviving runtime cache.
Benchmark restoration, integration, export, projection, and pending-queue replay
at explicit document/queue sizes. Resolve engine initialization and deterministic
actor/change identity before calling this a compatible replay implementation.
Retain the benchmark in the repository's benchmark infrastructure. Full
collaboration remains Phase 8; this spike gates the representation choice and
the Loro adapter, not the local editing slice.

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

A Decoration is not content. It is the ephemeral third kind beside Marks and
Annotations (§11). A Decoration is computed from current state (document,
presence, spellcheck, queries), rendered by the DOM adapter, and discarded on
every state change. It never serializes with the Document.

An Annotation may project into Decorations for display (a comment's highlight),
but the Annotation itself — identity, anchor, metadata, lifecycle — persists as
document metadata. Converting a Decoration back into document state (accepting
an AI suggestion, turning a search match into a Citation) is always an explicit
semantic command, never an automatic round trip.

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

**Implemented (single-user only).** `RichText.History` is snapshot undo over
`EditorState` — document plus selection, so undo restores the caret too. It
lives in the application Model as interaction state, not in published content.
Grouping is explicit and clock-free: `groupFor(command)` marks text insertion
and deletion `'typing'`, so a burst collapses into one step while every other
command stands alone; the primitive-state history was not reused because the
document is owned by the application, not by a history cell. `undo`/`redo`
return `undefined` rather than throwing, a commit after an undo clears the redo
stack, and the stack is bounded (200 steps by default).

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
semantic command
   │
   ▼
owning backend (local or replica)
   │
   ▼
same observable result
a human's edit produces
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

**Implemented (copy side and codec).** `sliceOf(document, selection)` produces a
versioned semantic `Slice`: a whole block for a node selection, and for a range
only the covered part of each touched block with runs trimmed to the selection,
so a partial copy never drags in an untouched block. `serializeSlice` /
`deserializeSlice` round-trip it with a strict decoder (wrong version, excess
fields, malformed blocks, and duplicate identities inside the slice all return
`undefined`), `withFreshIds` remints identities so a paste cannot collide, and
`sliceFromText` is the plain-text fallback. Identities come from the caller, as
everywhere else.

Still pending: HTML on either side of the boundary.

**Paste insertion, implemented.** `{ type: 'Paste', slice }` remints every
identity, then places the content relative to the caret: above the block at its
start, below it at its end, and mid-block by splitting the block so text after
the caret stays below what was pasted. A range is replaced first. The caret
lands at the end of the pasted text, or — when the pasted content ends without
text — at the start of the trailing half the split created. An empty slice is a
no-op preserving state identity.

**DOM clipboard events, wired in the harness.** `copy`/`cut` write the slice
under `application/x-foldkit-richtext+json` plus its plain text; `cut` also
emits the delete intent a Backspace would, and a collapsed caret cuts nothing.
`paste` prefers the slice payload, falls back to plain text when the payload is
absent or unreadable (a strict decode failure must not paste nothing), and
leaves an empty clipboard to the browser's default. The paste command remints
identities, so the placeholder ids a plain-text payload needs never reach the
document. `copy`/`cut` also write `text/html`.

---

# 70. HTML import/export

HTML is an interchange format, not the document model.

Each Node/Mark renderer may optionally contribute:

```text
toHtml
fromHtml
```

or use centralized interpreters.

**Export implemented; import implemented in the adapter.** `toHtml(blocks)` (and
`documentToHtml`) serializes a document or a slice: known marks become
`strong`/`em`/`code` in a deterministic nesting order, unknown marks survive as
`data-marks` on a span, unknown blocks as a `<div data-unknown="Type">`
placeholder, and text and attribute values are escaped so content cannot become
markup. `toText` / `documentToText` give the plain-text projection.

Import is a whitelist walk over a `DOMParser` tree (in `examples/richtext`,
because the package stays DOM-free): known block and inline tags map to
semantic blocks and marks, our own `data-*` attributes round-trip, every other
element is unwrapped or dropped with a diagnostic, no attribute is ever
interpreted, and `script`/`style`/`iframe` and friends are dropped with their
content. A Kit passed to the adapter degrades any node kind the vocabulary does
not declare. Paste resolves slice → HTML → plain text; nothing parses HTML into
authority without that walk.

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

Implemented: `decodeDocument` converts blocks whose type this version does not
implement into `Unknown` nodes before structural decoding — original type,
remaining JSON fields verbatim, and no text runs (the raw subtree is preserved
inside the JSON props). Unknown nodes are structurally addressable (move,
delete) but never text-edited, and `findUnknownNodes` reports them for the
publishing gate alongside `findUnknownMarks`. Non-JSON payloads, missing ids,
unknown top-level fields, and unsupported document versions are rejected rather
than silently transformed.

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

**Implemented.** `migration(name, from, migrate, to?)` matches a block by its
type, its node kind, or a preserved block's `originalType`; `migrate(document,
migrations)` runs the list in order over every block it reads and reports
`{ document, applied: [{ name, node }], unused }`. The list order is the chain —
a later migration sees what an earlier one produced. `promoteUnknown(name, from,
to, Props)` is the common case: a preserved unknown block becomes a declared
node whose props the target's schema decodes.

Three rules are enforced in code rather than left to discipline: a migration
must return the same `id` (changing it throws, instead of silently breaking
every reference to that node); the returned block must decode as a block (so a
migration cannot write non-JSON props or an unknown shape into persisted
content); and returning `undefined` declines the block, which is what
`promoteUnknown` does when legacy data does not decode rather than
half-converting it. Migrations run at a boundary the application chooses —
loading, publishing, or an explicit upgrade — never automatically on every read.

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

**Measured, with the copying cost removed.** `packages/richtext/bench/operations.bench.ts`
(and `pnpm bench`) covers the shapes an editor meets. A transaction accumulates
changes per block and copies each affected container once, so N edits in one
paragraph are O(N) rather than N copies of the same array. Measured back to back
on the same machine (mean), old against current:

```text
                                          before   after
paste 50k characters into one run          0.021    0.023 ms
type one character into a 20k-character run 0.024    0.025 ms
toggle a mark over a 400-run selection     2.07     1.80 ms
toggle a mark over a 2000-run selection   16.99     9.59 ms
toggle a mark over 200 runs / 200 blocks   1.47     1.48 ms
delete a range spanning 100 paragraphs     3.06     3.27 ms
split a block inside a 400-run paragraph   1.14     1.35 ms
paste one paragraph into a 200-block document 1.13   1.22 ms
```

The large formatting case is what the change targets: it halves, and it scales
linearly now (5× the runs costs 5.3× the time, where it used to cost 8.2×).
Differences under a few percent elsewhere are within this machine's run-to-run
noise and are not claimed either way. What remains: a structural operation still
rebuilds the document index, and normalization walks the whole dirty set,
including run identities that cannot match a block.

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

command                   Message / semantic command

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
RichText semantic command, executed here by the Loro adapter
(replica backend; the local backend path is §51)
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

The adapter executes the command; it never converts a positional Transaction.
Human, agent, and slash-command producers share the command and its validation,
and differ only in which backend owns the document they target.

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
InsertText/DeleteText/AddMark/RemoveMark/SetSelection transactions with UTF-16
position maps. Operations are built with `Edit.*` constructors that accept ids
or `Node` references, fill `type`, and throw on malformed shapes. Mark edits
are idempotent per run and emit no position steps. `decodeDocument` enforces
bounded `DocumentLimits` with generous defaults; violations throw a named error.
Unknown mark strings load verbatim and round-trip; `findUnknownMarks` lists them
per run for a publishing gate, while `Edit.addMark` accepts only known marks.
`decodeDocument` preserves unknown blocks as `Unknown` nodes (original type,
JSON fields, no runs) and reports them via `findUnknownNodes`; unknown blocks
are structurally addressable but never text-edited. `SplitNode` divides one text
block at a run offset with caller-supplied identities; `JoinNode` moves runs
into the surviving previous sibling without merging. `MoveNode` reorders blocks
without touching run identities, and `SetNodeProps` retypes heading levels.
Kits declare a vocabulary (`RichText.kit`, `validate`) without yet driving
parsing or `apply`. `run(state, command, ids)` resolves intents (typing,
delete, split, toggle mark, set selection) into transactions, taking identity
from the caller's `mint`. `History` gives snapshot undo over `EditorState` with
explicit, clock-free grouping.
`SplitRun` divides one run so each side can carry
different marks (a bare split is normalized away).
`InsertNode` splices caller-built blocks at explicit indexes; `DeleteNode`
removes one block and collapses its positions to the surviving text start.
Every transaction normalizes touched blocks by merging adjacent same-mark runs
(first identity wins, later ids retire); loading stays verbatim and empty
transactions stay untouched.
`ChangeSet` carries
`insertedNodes`/`removedNodes`/`structureChanged`, and the position map
relocates split runs with affinity at the split point. `InsertText` takes an
optional `marks` set, so an application can hand the caret's stored marks to the
insertion and get a span carrying exactly them; unknown marks are refused. This
is not completion of Phase 1.

Remaining: nested children beyond runs, marks with props and custom mark
authoring, metadata keys, and collaboration (including
collaborative undo), alongside
the parallel feasibility tracks below. The current implementation is
private/unpublished and APIs may change as those proofs establish the final
contracts.

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
deletions/merges, selection direction, codec round trips, and unknown-mark
preservation versus edit/publish validation.

Do not gate the Phase 3 editing slice on the integration proofs. The slice
needs the Operations and position-mapping work from the list above, and
nothing else below. Run three bounded feasibility proofs as parallel tracks
that gate promotion, not discovery:

1. Controlled Bundle (gates Phase 4): **done** — `examples/richtext` proves one
   parent transition commits document and interaction state, including rejection
   and external document replacement (§27). The browser half remains Phase 3.
2. Stateful Form (gates Phase 5): **spiked** — `examples/form` shows a
   non-RichText stateful control working as a Bundle (Commands, a Subscription,
   a Resource) and pins exactly what the Form API cannot carry yet (§44).
   Content-change reporting is implemented (§45). The Form-side shape is still
   to build.
3. Collaboration (gates Phase 8): synchronous replay over reconstructible
   state, checkpoint plus pending replay, and retained cold/warm benchmarks
   (§58). Do not implement a production adapter yet.

Record results and unresolved constraints before freezing public APIs. Phase 1
is complete when the semantic core above has answers; each proof completes on
its own track when its gate opens.

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

**Built (private, `examples/richtext`).** `src/view.ts` renders a document or a
slice as ordinary Foldkit `Html` through `inertHtml`; `packages/richtext/src/html.ts`
serializes HTML and plain text with escaping, unknown marks on `data-marks`, and
unknown blocks as placeholders; `examples/richtext/src/html.ts` imports HTML
through a whitelist walk. None of it is promoted to supported API yet: the
package has no Foldkit dependency, so the view lives in the harness.

---

# 103. Phase 3 — vertical editing slice

Add `foldkit-richtext-dom` as a private spike, not a supported editor.

Prove the nastiest tiny loop end to end over two paragraphs and no fancy
blocks:

```text
Document
  ▼
semantic command (local backend)
  ▼
owned contenteditable subtree
  ▼
type text
selection
Enter (split)
Backspace/Delete (join)
bold at a boundary
IME commit/cancel
local undo
  ▼
patch dirty DOM only, restore/map selection
```

Support:

```text
typing
selection
Enter
Backspace/Delete
basic bold/italic
IME composition events
local undo history
focus
```

Defer clipboard, drag/drop, and mobile virtual keyboards to Phase 4. Keep the
API private and throwaway-tolerant: the slice exists to let the browser
challenge the semantic model (normalization id retention, mark boundaries at
insertion points, position mapping under IME, undo grouping). Use a minimal
standalone harness; do not build the Bundle editor around unproven editing.

Exit criteria: typing "hello" feels correct, IME commits land as single
transactions, bold-boundary typing follows mark semantics, split/join preserve
selection direction, and undo restores document and selection. Record every
place the semantic model had to change.

**Built so far (first increment, `examples/richtext/src/dom.ts`).** Rendering
into an owned `contenteditable` subtree, both-way position mapping, and
in-place ChangeSet patching, with jsdom tests including one end-to-end loop
(DOM selection → command → patch → restored selection). Two findings worth
keeping: a DOM caret carries no affinity, so mapping back must derive it (run
end → `after`, elsewhere → `before`) rather than pretend to round-trip it; and
untouched elements must keep object identity, which is the property that makes
patching cheaper than re-rendering.

**Built so far (second increment, `examples/richtext/src/events.ts`).**
`beforeinput`/`keydown` translation into commands, `preventDefault` on
everything the adapter understands, and composition handover: the browser keeps
its temporary text while an IME composes, and `compositionend` becomes one
`InsertText` at the semantic caret, corrected by the following patch. Three
findings from the wired loop: an inserted node must be inserted (replacement
alone omits it), an empty run still needs a text node so a caret inside it is
addressable, and a removed identity that is also dirty must still lose its
element.

Still to build: mobile keyboards and real-browser verification; paste insertion
and the DOM clipboard events are done, as are the read-only renderer and HTML
import/export.

**Undo, wired end to end.** The harness now commits `History` in the child and
undoes through the same parent transition. Undo replaces the document rather
than editing it, so it reports a `Replaced` out-message with a whole-document
`ChangeSet`: every surviving identity dirty, every departed identity removed.
`Mod-z`/`Mod-Shift-z`/`Mod-y` are history intents rather than commands, so the
adapter routes them through a separate `onHistory` channel.

**Composition cancellation.** `repair(dom, content)` makes the subtree match the
document again after the browser touched it: it re-renders only blocks whose
rendered text drifted, drops elements the document does not know, and returns
the same value when nothing was wrong. `compositionend` always repairs (a
committed IME and a cancelled one both leave text the document never had) and
restores the semantic selection afterwards, because a repair detaches the live
one. Only then does a commit become one `InsertText` at the semantic caret.

**Stored marks.** A collapsed mark toggle belongs to the caret, not the document.
The harness keeps `storedMarks` in its interaction state: a collapsed
`ToggledMark` flips that set without touching the document (so history gains no
step), a caret move clears it, and the next `Typed` passes it to the command
layer. The package gained the other half — `InsertText` takes an optional
`marks`, and when it is present the inserted span is split out of its run and
given exactly that set, with an unknown mark refused at the toggle rather than at
the first keystroke after it. Without `marks`, the boundary rule still decides.
That keeps the caret's format caller-owned: `run` reads no hidden cursor state,
which is the same reason a collapsed `ToggleMark` stays a no-op in the command
layer.

No collaboration. No Form. No CMS.

---

# 104. Phase 4 — editor Bundle features

Promotion gate: the controlled-Bundle proof (§27, Phase 1 track 1) must pass
before any of this becomes supported API. The spike's editing behavior is kept;
only its ownership is replaced — no second implementation.

Add:

```text
selection state
stored marks
history
keymaps
copy/paste
drag/drop
mobile virtual keyboards
toolbar integration
slash commands
```

The Phase 3 spike already carries the first five to varying degrees — selection
state, stored marks, history, copy/paste over DOM clipboard events, and part of
the keymaps. Promotion replaces their ownership with the Bundle's; it does not
reimplement the behavior.

Prove editor interaction remains ordinary Foldkit Messages and Model.

---

# 105. Phase 5 — stateful Form controls

Generalize `foldkit-form`.

Build on the non-RichText control proof from the parallel Phase 1 track and
complete its public API,
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

Extend the parallel feasibility proof into an editor adapter; retain its cold-state
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

Prove AI and human editing use the same semantic command path.

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

Single-user and collaborative editing share one semantic command API:
commands, validation, and observable semantics. Execution differs by
backend; positional Transactions are the local backend's language only.
```

---

# 114. Final mental model

```text
                          RichText Kit
                    rules and vocabulary
                              │
                              ▼
                    Document + Selection
                              │
              ┌───────────────┼─────────────────┐
              │               │                 │
              ▼               ▼                 ▼
        Human intent    Agent intent        API intent
              │               │                 │
              └───────────────┼─────────────────┘
                              ▼
                    resolve against Kit,
                   Document and Selection
                              │
                              ▼
                      semantic commands
              (shared validation + semantics)
                              │
              ┌───────────────┼─────────────────┐
              │               │                 │
              ▼               ▼                 ▼
          human edit       agent edit      API / slash
              │               │                 │
              └───────────────┼─────────────────┘
                              ▼
                    ┌─────────────────────┐
                    │ local backend       │
                    │   positional ops    │
                    │ replica backend     │
                    │   convergent ops    │
                    └─────────┬───────────┘
                              ▼
                    Document + ChangeSet
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

> **Foldkit Rich Text is a typed semantic document edited through explicit Messages and semantic commands — executed by a local or replica backend — rendered through interpreters, composed through Bundle and Mixins, authored through Form/CMS, and made collaborative by strengthening durable changes with convergent identity and causal semantics.**

That should be the constraint against which every API decision is evaluated.

---

# 115. Remaining work

A verified inventory of what is not done, by phase. In this section:

- **package** means `packages/richtext` (private, unpublished);
- **harness** means the private `examples/richtext` spike, which has no
  `package.json` and is not supported API;
- **published** means usable by another workspace package.

Verified against source and tests at commit `0f2c7cc`; see the verification note
at the end. Re-check this list when a phase lands, because a stale inventory
reads as current.

## Phase 1 — semantic core

Done and tested: version-1 documents, text runs, paragraphs and headings,
Bold/Italic/Code, branded NodeIds, range and node selections, position mapping,
atomic transactions with ChangeSets, merge normalization, mark definitions with
boundary expansion, bounded decode limits, unknown node and mark preservation,
application node kinds with Kit-validated props, migrations, the command layer
(including stored marks through `InsertText.marks`), snapshot history, clipboard
slices, HTML export, and inspection.

Not done:

- **Nested children (`blockContent`).** Blocks hold runs only. Lists, quotes, and
  nested callouts need blocks containing blocks, which reaches the `Block` type,
  position mapping, `locate`, every operation, normalization, HTML export and
  import, and both renderers. §13 defines the child-constraint vocabulary
  (`BlockContent`, `InlineContent`, `TextContent`, `Atom`) this should provide.
- **Mark props and custom mark authoring.** A run's marks are names from a fixed
  union. `Edit.addMark` accepts only `Bold`/`Italic`/`Code`, so a Kit tunes
  expansion policy but cannot declare a mark, and a mark cannot carry data. `Link`
  with an `href` needs a mark *value* (`{ name, props }`), a prop schema on
  `MarkDef`, a Kit-declared mark vocabulary, and HTML export/import for it. Every
  consumer of `Text.marks` and every fixture is in scope.
- **Metadata keys.** `foldkit-metadata` facts on Kit, Node, and Mark definitions
  (§12) are not wired: no interpreter owns a metadata key yet. The package does
  not depend on `foldkit-metadata`. They must stay outside the document codec.
- **Kit-driven semantics.** A Kit can validate a document (`validate`) and the
  harness HTML parser degrades undeclared *node* kinds, but `apply` never
  consults a Kit, and a Kit cannot declare marks or mark props. Where a Kit
  should constrain `apply` is an open design question.
- **Collaboration.** Convergent representation, collaborative undo, and the
  replica backend belong to Phase 8 and later; nothing exists here.

## Phase 2 — read-only renderer

Exists as harness code (`examples/richtext/src/view.ts`): a `Document` or `Slice`
becomes ordinary Foldkit `Html` through `inertHtml`, with no dispatch and no DOM
ownership. Not published; promotion is part of Phase 4.

## Phase 3 — vertical editing slice

Done in the harness: rendering into an owned `contenteditable` subtree, both-way
position mapping, ChangeSet patching that preserves untouched element identity,
`beforeinput`/`keydown` translation, IME composition commit and cancellation with
`repair`, local undo, and copy/cut/paste over DOM clipboard events with a
slice → HTML → text fallback.

Not done:

- **Mobile virtual keyboards.** Not attempted.
- **Real-browser verification.** Every DOM test runs in jsdom, so the adapter's
  behavior under a real browser (native selection, IME, clipboard permissions) is
  unverified. The design review deferred this explicitly.
- **The slice and the Bundle editor are separate proofs.** `events.ts` produces
  commands while `controlled.ts` consumes Messages; nothing wires the DOM adapter
  to the Bundle, and the design keeps them apart until Phase 4.

## Phase 4 — editor Bundle features

The controlled-Bundle proof passed (§27), so the gate is met; nothing is
published. Per item:

```text
selection state           harness: in the Bundle's interaction state
stored marks              harness: interaction state plus InsertText.marks
history                   harness: snapshot History committed in the child
keymaps                   adapter only (Mod-b/i/e, Mod-z/y, Enter, Backspace,
                          Delete); no Bundle keymap layer
copy/paste                adapter only; not routed through the Bundle
drag/drop                 not started
mobile virtual keyboards  not started (Phase 3)
toolbar integration       not started
slash commands            not started
```

Also not done: promoting any of this into a package with a supported API, and the
keymap and toolbar layers that turn intents into Messages rather than commands.

## Phase 5 — stateful Form controls

Spiked in `examples/form`: a non-RichText stateful control works as a Bundle with
Commands, a Subscription, and a Resource, and §44 records what the Form API cannot
carry yet. Content-change reporting is implemented (`authoredChanged`), and
`packages/cms/src/editor.ts` consumes it.

Not done: the public Form API for stateful controls, renderer integration,
lifecycle, persistence and resume coverage, the RichText integration, and the CMS
autosave switch to the Form transition's authored-content result.

## Phase 6 — CMS example

Not started: a rich-text article in `examples/cms` covering type, autosave,
reload, resume, preview, publish, visitor rendering, restore revision, and
scheduled publication.

## Phase 7 — richer Nodes

Not started: lists, links, quotes, code, image, callout, mentions, custom embeds,
and the Surface-backed and React-backed node proofs. Links, quotes, and code
depend on Phase 1's mark props and nested children.

## Phases 8–12

All unstarted:

- **Phase 8, Loro collaboration spike.** Needs the parallel replay and checkpoint
  feasibility proof, a CRDT engine dependency, and an adapter for plain text,
  bold, link, and stable selections, tested with two offline replicas, concurrent
  insertions, concurrent formatting, reconnect, and convergence.
- **Phase 9, Sync/Durable integration.** Convergent change packets as a durable
  application Message over the existing outbox, journal, checkpoint, and replay,
  then a decision on whether Sync needs custom op identity, dependencies, or
  cascading rejection.
- **Phase 10, collaborative structured nodes.** CRDT lists, maps, and movable
  trees beyond one text sequence.
- **Phase 11, presence.** Ephemeral remote presence, stable remote selections,
  cursor decorations, and user names and colors, kept outside Durable.
- **Phase 12, AI editor capabilities.** Semantic editor intents exposed to Agent,
  with human and agent edits sharing one command path.

## Known non-goals

- Sync whole documents per keystroke (§95).
- Assume sequential replay is sufficient for collaboration (§96).
- Make CMS revisions the CRDT log (§97).

## Verification note

Absence claims were checked as follows: keyword search over
`examples/richtext/src/*.ts` found no keymap, toolbar, slash, or drag/drop
handling (the `drop` matches are DOM element and attribute cleanup); listing
`packages/richtext/src/index.ts` gave the exported surface above; grep over
`packages/richtext/src` and `examples/richtext/src` found no caller of
`validate(` or `inspectKit(`, both application-facing; `packages/` contains only
`richtext` (no renderer package); and `foldkit-metadata` appears in six package
manifests, none of them richtext. Tests stand at 28 vitest files plus 2 type-test
files in the package, and 5 in the harness.
