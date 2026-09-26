# Foldkit Plus Rich Text

**Status:** Phase 1 is implemented except for mark overlap rules and metadata, metadata keys, and collaboration. §121's rendering registry reaches the serializer, the read-only view, the adapter, and — via §122 — the editor Bundle. Nested children beyond runs (§116) are done. Phases 2 and 3 exist as private spikes, not supported API: the read-only renderer, HTML import/export, and the DOM editing loop, including stored marks. Phase 4 is in progress: the interpreter, event translation, HTML import, the read-only view, and the editor Bundle are in `packages/richtext-dom` (private); the mark toolbar is in `foldkit-richtext-dom` and as a Mixins family in `foldkit-mixins-richtext`; and §118's slices 1–3, §119's 1–2 (slice 3 dropped per §123), §120's slice 1, and the slash menu (§123) have landed. No phase is published. The three integration proofs stand as recorded in §101: the controlled-Bundle proof passed, the stateful-Form control is spiked, and the collaboration proof is unstarted. §115 is the full remaining inventory; §124 proposes a
Markdown-first reordering of what to build next, and is a plan rather than a status report.
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

**Implemented.** A `Node` block carries `kind`, JSON `props`, and `children`; a
Kit declares the kind with `RichText.node(name, { Props, children })` and
`validate` reports `UnsupportedNode` for an undeclared kind and `InvalidProps`
when the schema refuses the props — so the codec stays application-agnostic and
the Kit is where an application's types meet persisted data. `children` is the
declared content mode: a node block holds runs (`textContent`) or nested blocks
(`blockContent`, §116), so lists, quotes, and nested callouts are ordinary node
blocks. Positions, every operation, selection, clipboard slices, history, both
interpreters, and HTML import/export work at any depth, and a split keeps its
kind and props on both halves. `data-node` is the default rendering until a Kit
renderer replaces it.

Not yet: renderers per kind and metadata. A Kit's content contract is enforced by
`validate`, not by `apply` (§117).

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

**Implemented.** A mark is a `MarkDef` made with
`RichText.mark(name, { Props?, expand? })`, and a Kit carries the definitions, so
an editor declares its own vocabulary:

```ts
const Link = mark('Link', { Props: Schema.Struct({ href: Schema.String }), expand: 'none' })
RichText.kit({ nodes: [...], marks: [Bold, Italic, Link] })
RichText.run(state, command, ids, { marks: markRegistry(kit.marks) })
```

A run stores a mark as a bare name when it has no props, or as `{ name, props }`
when it does. Loading preserves the form it found, so a names-only document
round-trips byte-equal, and because a run carries a name at most once it never
holds both forms of one mark. Props are part of a mark's identity: normalization
does not merge runs whose props differ.
`resolveInsertion` takes the registry, so the rule is unchanged but which marks
it applies to is the application's; a mark no registry declares expands `both`,
which keeps preservation from retargeting it away. The registry's declared names
are what `run` may add, and `validate` enforces a declared mark's prop schema
(`InvalidProps`). Overlap rules, mark metadata, and a Kit-aware renderer for
props (a real `<a href>` rather than `data-marks`) remain Kit work.

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

The representation and addressing this implies are decided in §116.

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

RetypeBlock

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

**Proof result (track 1, proved in the harness, now `packages/richtext-dom`).** The
controlled mode works with
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

The browser half followed (§118): the Bundle's view renders the host element, and
the patch Command the transition returns is what moves the DOM — so one transition
still commits the document and the interaction state, and rendering follows it.
What remains unproven is lifecycle beyond a single placement (an application
placing several editors, or remounting one) and real-browser behaviour (IME,
native selection).

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

**Implemented (`packages/richtext-dom/src/view.ts`).**
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

> **Built as `Input.bundle` (2026-09-25),** shared with the page builder's Phase 0.
> A key's draft is the control Bundle's Model; its Messages travel as the form's
> `Control` Message; its Commands, Subscriptions and Resources are the form's;
> `value`, `fill` and `settled` are the hooks below, with `saved` folded into
> `settled`. See [`foldkit-form`](../../packages/form/README.md#a-control-with-a-model-of-its-own).
> The text below is the proposal as written.

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

> **Built (2026-09-25), as §126.** `Decoration`, `DecorationSet`, and `decorationsIn` are
> the contracts and the shared projection; the read-only view overlays a set as
> `span[data-decoration]`. The editable adapter's overlay is deliberately not built yet
> (§126 records why: one text node per run is what makes a caret mappable).

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

Import is a whitelist walk over a `DOMParser` tree (in `packages/richtext-dom`,
because the core package stays DOM-free): known block and inline tags map to
semantic blocks and marks, our own `data-*` attributes round-trip, every other
element is unwrapped or dropped with a diagnostic, and `script`/`style`/`iframe` and
friends are dropped with their content. Only a fixed few attributes are ever read —
a link's `href`, an image's `src` and `alt`, a code fence's language — and each passes
a scheme policy first (`safeUrl`), so a pasted `javascript:` URL is refused with an
`UnsafeAttribute` diagnostic rather than carried into props; `style`, `onclick`, and
every other attribute are still never read. A Kit passed to the adapter degrades any node kind the vocabulary does
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
content), and the assembled document is checked for globally unique identities
after each changed migration pass; returning `undefined` declines the block, which is what
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
without touching run identities, and `RetypeBlock` changes a text block's type
(a paragraph, or a heading at a level) while keeping its runs.
Kits declare a vocabulary (`RichText.kit`, `validate`) without yet driving
parsing or `apply`. `run(state, command, ids)` resolves intents (typing,
delete, split, toggle mark, set selection, retype block) into transactions, taking identity
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

Remaining: mark overlap rules, metadata keys, and collaboration (including
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

1. Controlled Bundle (gates Phase 4): **done** — the editor Bundle proves one
   parent transition commits document and interaction state, including rejection
   and external document replacement (§27). §118's slices followed it: the view
   renders the host and the patch Command moves the DOM, which was the browser
   half Phase 3 left open.
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

**Built (private).** `packages/richtext-dom/src/view.ts` renders a document or a
slice as ordinary Foldkit `Html` through `inertHtml`; `packages/richtext/src/html.ts`
serializes HTML and plain text with escaping, unknown marks on `data-marks`, and
unknown blocks as placeholders; `packages/richtext-dom/src/html.ts` imports HTML
through a whitelist walk. The read-only view is not promoted to supported API yet:
it needs a Foldkit dependency, which `foldkit-richtext`'s DOM-free rule keeps out
of that package.

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

**Built so far (first increment, now `packages/richtext-dom`).** Rendering
into an owned `contenteditable` subtree, both-way position mapping, and
in-place ChangeSet patching, with jsdom tests including one end-to-end loop
(DOM selection → command → patch → restored selection). Two findings worth
keeping: a DOM caret carries no affinity, so mapping back must derive it (run
end → `after`, elsewhere → `before`) rather than pretend to round-trip it; and
untouched elements must keep object identity, which is the property that makes
patching cheaper than re-rendering. The interpreter moved out of the harness when
Phase 4 promotion began; see `packages/richtext-dom/README.md`.

**Built so far (second increment, now `packages/richtext-dom/src/events.ts`).**
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
The harness keeps `storedMarks` in its interaction state: `null` inherits the
document's marks, while an array is an explicit override, including an empty
array for plain text. A collapsed `ToggledMark` flips that set without touching
the document (so history gains no step), a caret move resets it to `null`, and
the next `Typed` passes an explicit override to the command layer when present.
The package gained the other half — `InsertText` takes an optional
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

A verified inventory of what is not done, by phase. §124 proposes a different order
for the work than these phases do; this inventory stays the record of what exists. In
this section:

- **package** means the core `packages/richtext` (private, unpublished); the DOM
  package `packages/richtext-dom` and the Mixins family `packages/mixins-richtext`
  are named where they matter;
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
boundary expansion, prop schemas, and Kit-declared vocabulary, bounded decode
limits, unknown node and mark preservation, application node kinds with
Kit-validated props, migrations, the command layer (including stored marks
through `InsertText.marks`), snapshot history, clipboard slices, HTML export,
inspection, and nested children beyond runs (`blockContent`, §116): a node block
may carry nested blocks, and content at any depth decodes, round-trips, survives
unknowns, and is reached by commands, structural placement, both interpreters,
and HTML import/export.

Not done:

- **Mark overlap rules and metadata.** A mark definition carries a name, an
  expansion policy, and an optional prop schema; whether several values of one
  mark may overlap, and interpreter-owned mark metadata, are not modelled.
- **Kit-aware rendering of mark props — §121 done.** The HTML serializer,
  the read-only view, and the editable adapter each hard-coded the three shipped marks
  and fell back to *names*, so a declared mark with props rendered as `data-marks`
  rather than a real `<a href>`. §121 decides the registry that replaces that;
  `rendering(...)` and `toHtml(blocks, renderer?)` shipped in
  `foldkit-richtext`, the read-only view and the editable adapter render
  through it (§121 slices 2–3), and §122 carries it into the editor Bundle by host id.
- **Metadata keys.** `foldkit-metadata` facts on Kit, Node, and Mark definitions
  (§12) are not wired: no interpreter owns a metadata key yet. The package does
  not depend on `foldkit-metadata`. They must stay outside the document codec.
- **Kit-driven `apply` — settled, no change.** A Kit validates a document
  (`validate`) and constrains what `run` may add, and the harness HTML parser
  degrades undeclared *node* kinds, but `apply` never consults a Kit. §117 settles
  that it should not: the Kit resolves at the command layer, the backend applies
  structure, and a durable transaction must not depend on a vocabulary that may
  have moved.
- **Collaboration.** Convergent representation, collaborative undo, and the
  replica backend belong to Phase 8 and later; nothing exists here.

## Phase 2 — read-only renderer

In `packages/richtext-dom` (`foldkit-richtext-dom/view`): a `Document` or `Slice`
becomes ordinary Foldkit `Html` through `inertHtml`, with no dispatch and no DOM
ownership. Not published.

## Phase 3 — vertical editing slice

Done: rendering into an owned `contenteditable` subtree, both-way position
mapping, ChangeSet patching that preserves untouched element identity,
`beforeinput`/`keydown` translation, IME composition commit and cancellation with
`repair`, local undo, and copy/cut/paste over DOM clipboard events with a
slice → HTML → text fallback. The DOM half — interpreter, event translation, and
HTML import — is in `packages/richtext-dom`, and the read-only view and the
editable Bundle followed it there.

Not done:

- **Mobile virtual keyboards.** Not attempted.
- **Real-browser verification.** Every DOM test runs in jsdom, so the adapter's
  behavior under a real browser (native selection, IME, clipboard permissions) is
  unverified. A page to drive it now exists (`examples/richtext/harness.html`,
  served from source; see that harness's README), and it was verified to build and
  serve, but driving it needs a browser connected to the session, which this
  environment did not have. The page mounts through a `rendering(...)` registry, so
  driving it is also what would confirm §121's mark and node renderings and their
  reuse by `patch` in a real browser; `window.harness.rendered()` and `links()` say
  what the registry produced without reading the DOM by hand.
- **The slice and the Bundle editor are one editor now.** §118 decided how they
  meet — the view renders the host, and the DOM patch is a Command from `update`,
  not a Subscription — and §118's slice 1 landed: the Bundle has a view, and the
  Command its `update` returns is what moves the DOM.

## Phase 4 — editor Bundle features

The controlled-Bundle proof passed (§27), so the gate is met; nothing is
published. Promotion has begun: the DOM half — the interpreter (`dom.ts`), the
event translation (`events.ts`), and the HTML importer (`html.ts`) — moved from
`examples/richtext` to `packages/richtext-dom`, a private package with its own
tests, build, and README. §118 decided how a view owns that subtree and its first
three slices landed: the editor's view renders the host element, the patch Command
its `update` returns is what moves the DOM, paste and the undo/redo chords travel
the same path, and the editor Bundle and read-only renderer moved in beside the
interpreter. The harness is now only the browser page. The toolbar, slash, and
keymap layers remain.

Per item:

```text
selection state           the Bundle's interaction state
stored marks              interaction state plus InsertText.marks
history                   snapshot History committed in the child
keymaps                   the adapter's built-ins, plus a `keymap` table an
                          application adds to or overrides; the editor's own
                          binding layer waits for a binding that needs it (§119)
copy/paste                routed through the view's Messages (§118 slice 2)
drag/drop                 not started
mobile virtual keyboards  not started (Phase 3)
toolbar integration       the mark buttons and their active rule
                          (`foldkit-richtext-dom/toolbar`, `marksToolbar`), and the
                          Mixins family that re-renders them
                          (`foldkit-mixins-richtext`, `markToolbar`); the rest of
                          §35's chrome is §120 slice 2
slash commands            the editor's catalogue and menu
                          (`foldkit-richtext-dom/editor`: `slashQuery`,
                          `slashEntries`, `matchingEntries`, `slashMenu`), the family's
                          re-export, `slashMove`, and `slashMenuView`, and the Bundle's
                          `menuIndex` with `Entered` resolved against a live query
                          (§123)
```

Also not done: promoting the rest into packages with a supported API, and the editor's own
keymap layer, which §123 dropped rather than built (an unconditional chord table cannot
express "only while a query is live", and a view-level `OnKeyDownPreventDefault` is the
framework's answer). A menu choice removes the typed query and applies the entry as one
action now (§124 §5).

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

Partially done: the standard vocabulary declares lists, links, quotes, code, images, and
tables (`standardNodes`/`standardMarks`) and gives each kind its element
(`standardRendering`), so all three interpreters render a declared kind through one
registry (§121 slices 1–4, §125). Link marks carry a real href.

Not done: mentions, callouts as a declared kind, custom embeds, and the Surface-backed and
React-backed node proofs. These are declarations and renderings; `validate` checks a
document against a Kit, and `run` refuses an edit a constraint forbids when the caller gives
it the vocabulary (§125).

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

The absence claims above were checked when §115 was written, and several facts have
moved since; the inventory above is the current one. Then: keyword search over the
harness source (`examples/richtext/src/*.ts`, now `packages/richtext-dom`) found no
keymap, toolbar, slash, or drag/drop handling; listing
`packages/richtext/src/index.ts` gave the exported surface; grep over
`packages/richtext/src` and the harness found no caller of `validate(` or
`inspectKit(`, both application-facing; `packages/` held only `richtext` (no
renderer package); and `foldkit-metadata` appeared in six package manifests, none of
them richtext. Since then the DOM package and the Mixins family exist, the adapter
gained a keymap table (§119) and a toolbar (§120), and `marksInRange` joined the
core.

---

# 116. Nested children

Today a block's children are text runs, and structural operations address a block
by its index in `document.children`. Lists, quotes, and nested callouts need
blocks that contain blocks, which changes both facts. This section decides the
representation and the addressing, and keeps the change additive: no version
bump, and no persisted content stops decoding.

## Representation: `blocks` on a node block

A `Node` block gains an optional `blocks`, holding nested blocks:

```ts
NodeBlock = {
  type: 'Node'
  kind: 'List' | 'Quote' | 'Callout' | ...
  id
  props
  children: Text[]   // direct runs; empty when blocks is present
  blocks?: Block[]   // nested blocks; present means this kind accepts them
}
```

- `children` stays `Text[]` on every block kind. That is what keeps the ~113
  `block.children` reads across the package and the harness working unchanged: a
  container simply has no direct runs, exactly as `UnknownBlock` already does.
- `blocks` present means the kind accepts block children; absent means runs. The
  codec enforces what it can — "blocks present implies `children` is empty" — and
  a Kit's declaration must agree about the mode (below).
- `Block` and `NodeBlock` are mutually recursive. `Schema.suspend` carries that,
  and strict decoding propagates through it: a nested block's excess property is
  rejected, and an unknown nested kind is rejected so a recursive
  `preserveUnknownBlocks` can turn it into an `Unknown` block. Verified with a
  probe before writing this: nested decode, byte-equal round-trip, flat documents
  unaffected, and excess properties rejected at every depth.

Rejected alternatives:

- A uniform `{ kind: 'text' | 'blocks', children }` field is the cleaner shape,
  and §13's vocabulary (`TextContent`/`BlockContent`) points at it, but it changes
  the shape of *every* persisted block: version 1 documents would stop decoding,
  which needs a version bump and a migration path the codec does not have
  (migrations run on already-decoded documents). Nesting is not worth breaking
  every stored document.
- A separate `Container` block kind is explicit, but adds a member to every block
  switch for no capability: the mode is already self-describing by presence.

## Addressing: a parent, then an index

Operations that place a block gain an optional parent:

```ts
InsertNode { block, parent?: NodeId, at: number }
MoveNode   { node, parent?: NodeId, to: number }
```

`parent` absent means the document root, so a transaction persisted before nesting
replays exactly as it did. Internally `apply` indexes the tree by *path*
(`Map<NodeId, ReadonlyArray<number>>`, root-first indices) instead of the current
`Map<NodeId, number>`, and resolves `(parent, at)` to a path before mutating. Text,
mark, and selection operations need no parent: they address runs by id, and the
index finds them wherever they are.

Document order becomes one depth-first walk — a block's runs, then its nested
blocks — used by `ordered`, `covered`, `deleteRange`, `sliceOf`, and every
selection comparison.

`SplitNode` and `JoinNode` resolve their parent internally and refuse to cross one:
a split stays inside its block, a join merges siblings under the same parent.
Structural placement refuses a parent whose kind does not accept blocks with a new
`InvalidParent` diagnostic.

## What must become recursive

The flat two-level assumption lives in these places, and each one changes:

```text
document.ts     the id-uniqueness filter, inspect, selectionIsValid,
                findUnknownMarks, findUnknownNodes, preserveUnknownBlocks
command.ts      locate, covered, deleteRange, Paste's index arithmetic
clipboard.ts    locate, ordered, sliceOf, plainTextOf
transaction.ts  indexDocument, the block-index lookups, the per-block copies
transform.ts    the touched-node walk that feeds mergeAdjacentRuns
html.ts         renderBlock, toText
kit.ts          validate's block loop
migration.ts    migrate's walk
harness         harness.ts (the browser page)
richtext-dom    the interpreter, event translation, HTML import, the view, and the
                editor (moved out of the harness for Phase 4)
```

What does not change is anything that reads a single block's runs: position
mapping inside a block, mark resolution, and normalization within a run array.
The enumerations above are the ones that walk the whole document; all of them are
recursive now (slice 4 did `kit.ts`, slice 5 `migration.ts`).

## Kits: declaring the content a kind accepts

A kind declares the content it accepts:

```ts
RichText.block('Paragraph')                                  // built-in text block: runs
RichText.node('List', { children: RichText.blockContent })   // holds nested blocks
RichText.node('Callout', { Props: Tone, children: RichText.blockContent })
RichText.atom('Image')                                       // no children
```

`node(name, { children })` defaults to `textContent` (runs); `blockContent` says the
kind accepts blocks; `block` and `atom` are the fixed shapes for a built-in text
block and an addressable node with no content. `validate` reports
`MismatchedDefinition` when a declaration and the document disagree about the mode,
reusing the mechanism that already catches an atom held as a block.

## Slices

Landing order, each keeping the suite green:

1. Model, codec, and reads: `blocks` on a node block, the recursive codec, limits,
   `inspect`, id uniqueness, the recursive walk for order, `locate`, and
   `selectionIsValid`. **Complete.** The model, the codec,
   `preserveUnknownBlocks`, `inspect`, the limits, id uniqueness,
   `findUnknownNodes`/`findUnknownMarks`, `selectionIsValid`, `Node.read`, the
   commands that reach a run wherever it sits (`locate`, `ordered`, `covered`,
   `deleteRange`), `apply`'s tree index — blocks addressed by path, each touched
   container copied once - and the clipboard (`sliceOf` keeps the container a
   range crosses, `withFreshIds` remints nested identities, `plainTextOf` walks
   the tree). Structural placement works at any depth; only a range that would
   merge across containers, and a parent that cannot hold blocks, are refused with
   `InvalidParent`.
2. Interpreters: recursive HTML export and import, the read-only view, and the DOM
   adapter. **Complete.** `toHtml` renders a container's nested blocks inside its
   element and `toText` gives one line per text block; the read-only view does the
   same; the editable adapter mounts and patches nested blocks, with a container
   that keeps its shape keeping its element. The harness importer reads
   `data-node` back: block children become a container, inline content a run
   holder, an undeclared kind degrades to its content, and props start empty
   because HTML does not carry them. Nested structural *patching* is deliberately
   absent: with placement refused, only run-level changes can occur inside a kept
   container, and those patch directly.
3. Structural operations at any depth: `InsertNode`/`MoveNode` with a parent,
   `DeleteNode`, `SplitNode`/`JoinNode` within a parent, and paste into a
   container. **Complete.** A split keeps its halves in the block's own container;
   siblings join within theirs, with the compatibility rules extended (a container
   and a run holder are refused, and two containers of the same kind concatenate
   their nested blocks rather than dropping them); `InsertNode` and `MoveNode`
   take an optional `parent`, so a block enters or leaves a container; paste lands
   in the caret's container; and `DeleteNode` collapses the selection to the
   nearest surviving run in document order, which fixes a case nesting introduced
   (a delete beside a container used to clear the selection even though the
   container held runs). What stays refused with `InvalidParent` is a range that
   would merge across containers, and a parent that cannot hold blocks.
   The DOM adapter needs no change here: a container whose item list changed is
   re-rendered where it stood, so its surviving items are rebuilt rather than
   patched individually — correct, and a follow-up for identity preservation.
4. Kit child constraints: `children` declarations, the mismatch diagnostic, and
   `atom`'s no-children enforcement. **Complete**, with one correction: the
   document codec and `validate`, not `apply`, are where a Kit's content contract
   is enforced, because `apply` takes no Kit — which §117 settles it should not.
   `node(name, { children })` declares `textContent` or `blockContent`,
   `validate` walks nested blocks and reports `MismatchedDefinition` when a
   declaration and the document disagree about shape or content, and the
   declaration settles the importer's one ambiguous case. That also fixed a false
   positive: an `atom` declaration reported a mismatch for exactly the empty
   application node an atom is held as.
5. Migrations and a demo: `promoteUnknown` into a nested kind, HTML import for
   lists, and a list in the Phase 3 slice. **Complete.** `migrate` descends into
   containers, so a preserved block nested in one is rewritten where it sits and
   the identity and invalid-content checks apply there too; `promoteUnknown` takes
   the target's content mode, so promoting into a container kind produces a valid
   block rather than one `validate` would call a mismatch. The harness importer
   maps `<ul>`/`<ol>` to a `List` and `<li>` to a `ListItem` when the Kit declares
   them, holding runs or nested blocks as the declaration says, and degrading to
   the items' content when it does not. The Phase 3 slice has an end-to-end test
   over a list: type in an item, Enter to split it (the new item stays in the
   list), Backspace at its start to join it back.

## Deferred

Mark overlap rules (§10), inline atoms (`inlineContent`, Phase 7), collaborative
structure (Phase 10), and slot-based node renderers (§34–§35) are not part of this.

---

# 117. Where a Kit constrains the pipeline

§115 carried "Kit-driven `apply`" as an open question. It is answered here so the
remaining Phase 1 items have a boundary to build against: **the Kit resolves at the
command layer; the backend applies structure.** `apply` takes no Kit and does not
gain one.

The pipeline has three seams, and each owns a different question:

```text
run(state, command, ids, options)      intent + vocabulary   does this vocabulary
                                       the Kit is here       allow this edit?
apply(state, transaction, transforms)  structure             does this leave a
                                       no Kit                valid document?
validate(document, definition)         content + declarations does this document
                                       the Kit is here       match the vocabulary?
```

Why the backend stays Kit-free:

- **The mental model already says so (§114).** The Kit is in *resolution* —
  "resolve against Kit, Document and Selection" — and the local or replica backend
  sits after the semantic commands, applying positional or convergent operations.
  A backend that re-resolved vocabulary would be a second resolver.
- **A transaction is durable, and the vocabulary is not.** A transaction is
  persisted and replayed, possibly long after, possibly by a build whose Kit has
  changed. If replay consulted the current Kit, an old transaction could fail — or
  worse, mean something else — because a declaration moved. A transaction has to be
  self-contained: it says what to do, not what was allowed at the time.
- **Collaboration makes this sharper (Phase 8).** A replica backend applies
  convergent operations from other peers, whose vocabulary may differ from this
  one's. The vocabulary check belongs at the local intent boundary, where a person
  or an agent asked for something; it cannot be a property of the replicated
  operation.
- **What `apply` must still refuse is structural, not semantic.** It already does:
  an operation that would give a block runs its kind cannot hold, merge opaque
  content, or retire an identity still selected is refused, because those make the
  document invalid on its own terms (§116, R21). That is the whole of its contract.

What the command layer constrains, and what the remaining items add there:

- **Today.** Which marks `run` may add (`MarkRegistry.declares`), and the stored
  mark set an insertion may carry.
- **Mark overlap rules (§115).** A definition saying a mark may carry several
  values is a *vocabulary* fact, so `run` reads it from the registry: an operation
  that sets a value for a name, or appends another, is the command layer's choice,
  and `apply` keeps the positional meaning of both without knowing which applies.
  `validate` then reports a document holding two values of a mark declared single,
  which is where a persisted document is checked.
- **Anything else a Kit could forbid an operation.** The same split holds: the
  command layer refuses before emitting, and the backend keeps only what would
  corrupt the document.

So the three seams are deliberate, not an omission. A Kit constrains what an
application may *ask for* and what a document may *publish*; it does not constrain
what a transaction may *mean*.

---

# 118. The editor as a Bundle with a view

§115 kept the Phase 3 slice and the Bundle proof apart: `events.ts` produced
commands, `editor-bundle.ts` consumed Messages, and nothing owned the DOM from a
view. This decides how they meet, before the work of meeting them.

## What Foldkit gives a view

A mount runs once, when its element enters the DOM. `Mount.defineStream`'s
`execute` receives the live element and returns a `Stream` of Messages whose scope
is the element's lifetime, so unmounting interrupts it. Args are captured at mount
and not refreshed across renders, and `viewStateChanges` carries `Live | Paused`,
not the Model. Foldkit's own guidance follows from that: *"If you need Model
changes to drive ongoing DOM behavior post-mount ... dispatch a Command from
`update`'s handler for that Message. The Command can find the element and do the
imperative work."*

So the patch is a **Command**, not a Subscription. That does not reopen §27's
objection: the objection was to a Command that *commits half the transition*, and
this one commits nothing. The parent's `onOut` still installs the document and
the interaction state in one transition; the Command only renders what that
transition committed.

## The shape

```text
view     host element: an id, and OnMount(RichTextDom.events())
mount    creates the interpreter over the host, attaches listeners, and emits
         one editor Message per intent
update   RichText.run (or undo/redo) — the proof's work exactly — returning the
         state and a Command carrying the ChangeSet
patch    finds the host by id, patches in place, restores the selection
```

The adapter handle is recovered through the element: the mount registers the
attachment in a `WeakMap` keyed by the host element, and the patch Command looks
it up. No DOM reference enters the Model (Models are schemas), and no Context
service has to carry one.

## One editor, two placements

Standalone and controlled differ only in the Link: standalone writes the document
into the child and reads it back, controlled projects the parent's document in
`read` and drops it in `write`. The Bundle, the view, the mount, and the patch
Command are identical, which is §27's requirement.

## What the adapter still needs

- **A selection channel — landed.** §30 lists `selectionchange`, and the adapter
  did not listen, so a caret move was never reported and the editor could not
  follow the caret. `attach` now takes `onSelection` and reports a position the
  application did not just commit, staying quiet while an IME owns the caret and
  after `detach`. The editor Message that consumes it still has to exist.
- **A host-element mount — landed.** `mount(ownerDocument, content)` builds a
  detached root, so a view had nowhere to put it.
  `foldkit-richtext-dom/host` adds `mountInto(host, content, options)`, which
  appends the root, attaches the listeners, and records the attachment in a
  `WeakMap` keyed by the element; `attachmentIn(host)` hands a patch Command the
  attachment, and `releaseMount` detaches and removes the subtree.
- **A Message union covering the intent vocabulary — landed.** The proof's union
  predated paste and selection. `packages/richtext-dom/src/editor.ts` is now that
  vocabulary and the `toMessage` translation into it, with a test over each intent
  and over the refusals; the proof imports the union instead of keeping a second.

## Slices

1. **Complete.** The editor Bundle carries a view: it renders the host element the
   patch Command finds, with `events` as its mount, and `update` returns the
   `RichText.patch` Command carrying the `ChangeSet` — §27's proof, now with a
   browser half. `packages/richtext-dom/test/editorView.test.ts` proves both ends:
   `Scene` renders the host at its id, and running the Command the transition
   returned is what moves the DOM. The vocabulary, `attachEditor`, `events`,
   `mountInto`, `attachmentIn`, and `patchEditor` are the tests underneath.
2. **Complete.** Paste and the undo/redo chords travel the same path as typing: the
   adapter reports them, `toMessage` maps them, `update` runs them, and the
   Command renders the result. `packages/richtext-dom/test/editorView.test.ts` drives
   a real `paste`
   event and the history chords through the view's own mount.
3. **Complete.** The editor moved into `foldkit-richtext-dom`: the vocabulary and
   mount (`/editor`), the Bundle and its placement (`/editor-bundle`, which is why
   the package peers on `effect`, `foldkit`, and `foldkit-bundle`), and the
   read-only renderer (`/view`). The harness is what is left of the Phase 3 slice:
   the browser page.
4. The toolbar, slash commands, and the Bundle keymap layer (§104's remainder).
   Decided in §119; they are three layers, not one, and the toolbar and the slash menu
   are done (`/toolbar` for an application that renders its own chrome, and
   `foldkit-mixins-richtext` for one that restyles parts). The editor's own binding layer
   is dropped rather than built: §123 shows the query is a read and a view-level
   `OnKeyDownPreventDefault` is the framework's mechanism.

---

# 119. The keymap, toolbar, and slash layers

§118's slices 1–3 landed: the editor is a Bundle with a view, and it lives in
`foldkit-richtext-dom`. §104's remainder is the layers around it. Three questions
decide them, and each is answered by what the code already is.

## Where a key binding belongs

`intentFor` hard-codes the chords an editor gets: Mod-b/i/e for the shipped marks,
Mod-z / Mod-Shift-z / Mod-y for history, and Enter, Backspace, Delete. An
application cannot rebind them, and a chord whose meaning is not a command has
nowhere to go: `Intent` carries a `Command` or a history direction, and `Command`
is the transaction vocabulary (insert, delete, split, mark, select, paste, move),
which is deliberately small.

So the keymap is two layers, not one:

- **The adapter's table.** `intentFor` takes an optional list of chord → command
  bindings, checked before its built-ins, so an application can add or override a
  chord without forking the adapter. This keeps the adapter's job — browser event
  to editor intent — and needs no new vocabulary.
- **The editor's bindings.** A chord that should produce an editor Message no
  browser event produces belongs to the editor instead: `events` would take a
  keymap whose bindings emit Messages directly. That is the "intents into Messages
  rather than commands" layer §104 asks for, and it is worth building when a
  binding needs it — the adapter's table already covers every chord the command
  vocabulary can express.

A binding is a chord (`Mod-Shift-b`, `Alt-ArrowUp`) plus what it produces.
Modifiers match exactly and the key is what the browser reports, so `Mod-b` does
not fire for `Mod-Shift-b` and a chord that types a symbol names the symbol —
Shift+8 is `Mod-Shift-*` on a US layout, not `Mod-Shift-8`.

## The toolbar renders chrome, and chrome is not the editor's

§29 gives the editor the `contenteditable` subtree and the application everything
around it — host, toolbar, menus, status. §35 makes the toolbar a Mixins slot
family (toolbar, toolbar group, toolbar button, active toolbar button). Both say
the same thing: the toolbar is not the Bundle's view. The Bundle renders one host
element; a toolbar beside it is the application's or a Mixins layer's `Html`.

So the toolbar needs a *read* from the editor, not a view: which marks are active
for the current selection. That is missing from `foldkit-richtext`.
`marksInRange(document, anchor, focus)` returns the marks every run the selection
covers carries — the marks a toggle would remove, which is what "active" means for
a button. A collapsed caret is its run's marks; the editor's `storedMarks` are the
editor's own state, and the button reads them first (a caret carrying Bold with
nothing selected lights the button).

The buttons themselves are small enough to land before the slot family, and they
are the part a family would build on: `foldkit-richtext-dom/toolbar` exports
`marksToolbar`, one button per mark over `marksInRange`, each carrying its active
state (`markActive`) and its Message. An application that does not need to restyle
parts gets a toolbar without adopting Mixins at all; §120 decides the family, which
cannot wrap these buttons and re-renders them instead.

## Slash commands are a menu over the editor's Messages

A slash command is a menu, not a binding: `/` opens a list, what follows filters
it, and choosing an entry runs an editor Message — or a command the vocabulary does
not have yet, such as turning the block into a heading. It needs the editor to
report the text before the caret (a read), the menu's own state (open, query,
selection), and its keys (ArrowUp/Down, Enter, Escape), which is the editor's
binding layer above. It is the largest of the three and the one that most wants a
real block vocabulary, so it comes last. "Turning the block into a heading" landed
first as `RetypeBlock` (a paragraph, or a heading at a level), because it is the
menu's first non-mark entry and it needed nothing else: the core can retype a text
block while its runs and identities stay.

## Slices

1. **Complete.** The adapter's keymap table: `intentFor` and `attach` take chord
   bindings, checked before the built-in chords; the tests cover matching, an
   override winning, exact modifiers, the key as the browser reports it, and
   fall-through to the built-ins.
2. **Complete.** `marksInRange(document, selection)` in `foldkit-richtext` reports
   the marks every run the selection covers carries — a caret reports its run's
   marks, an empty run can carry them, and a node selection reports what its
   subtree agrees on. That is what a toolbar's active button reads.
3. The editor's keymap layer in `events` — **dropped**, not deferred: §123 shows why an
   unconditional chord-to-Message table cannot express "only while a query is live" and
   what the framework already provides instead.
4. **Complete.** The buttons and their active rule landed
   (`foldkit-richtext-dom/toolbar`: `marksToolbar`, `markActive`), and so did the
   Mixins slot family that re-renders them rather than wrapping them
   (`foldkit-mixins-richtext`: `markToolbar`, `MarkToolbarSlots`). §120 corrects
   §119 on the wrapping: a slot view owns its elements, so the family could not take
   resolved attributes as a helper.
5. Slash commands, over 1 and 3 — **done; the layers are §123's.** The editor's catalogue
   (`foldkit-richtext-dom/editor`: `slashQuery`, `slashEntries`, `matchingEntries`,
   `slashMenu`) reads a query from `textBefore` and offers the text blocks and marks a
   caret can become; `foldkit-mixins-richtext` re-exports it, adds `slashMove` (over
   `RovingTabindex.move`, not `ListNavigation` — §123), and draws it with
   `slashMenuView`; and the editor Bundle's `EditorState.menuIndex` plus the application's
   own keys drive it, with `Enter` resolved against the live query in `update`.

---

# 120. The Mixins family

§119 put the toolbar's slot family in `foldkit-mixins-richtext` and expected it to
wrap `marksToolbar`. That expectation is wrong, and the Mixins contract is why: a
slot's contributions resolve into attributes *at the element the view creates*
(`slots.button.attrs([...])`), so a slot view owns its elements. A helper that makes
its own `h.button` calls cannot take resolved attributes. So the family re-renders
the buttons, and `marksToolbar` stays the path for an application that does not
adopt Mixins at all — the same split `foldkit-mixins-ui` has with `@foldkit/ui`.

## What the family publishes

§35's list is the target; the first slice is the mark toolbar:

```text
root      the toolbar's wrapper        Container
toolbar   the row of buttons           Container, Collection
button    one mark's button, per mark  Interactive, Click
```

Each button renders with its mark as the slot item, `slots.button.attrs(base, { mark })`,
so a Behavior styles or annotates one mark without the family knowing which marks
exist. `Attr.AriaPressed` is deliberately not in the contract: the view owns the
button's pressed state (through `markActive`), and a mixin that wants to override it
should conflict rather than silently win.

## What the view reads

```ts
interface MarkToolbarInput<Message> {
  readonly state: ToolbarState
  readonly marks?: ReadonlyArray<string> | undefined
  /** A mark to the Message that toggles it for this caller. */
  readonly toggled: (mark: string) => Message
}
```

The function is the open question. `foldkit-mixins-form` avoids functions in inputs
— "Foldkit admits no function nested in a placed view's inputs" — and passes the
form's Message constructors as data instead. Here the caller's Message is usually
the editor's wrapped (`edited(...)`), and a wrapper is a function, so the
constructor-as-data route does not reach it. A plain `SlotView` is not placed or
serialized, so a function input should be fine; a view used as a *placed* view's
view may refuse it. Slice 1 therefore keeps the function and proves it through a
real render, and falls back to a constructor input only if a placement rejects it.

## Slices

1. **Complete.** The mark toolbar family: `foldkit-mixins-richtext` publishes
   `MarkToolbarSlots` (root, toolbar, button) and `markToolbar<Message>()`, with the
   mark as each button's slot item `id`. The function input works — a plain SlotView
   holds one — which answers the question above; a Style, a Behavior reading the
   item, and a Scene click are all tested.
2. The rest of §35's chrome — floating toolbar, link popover, block handle,
   placeholder, status — as slots, when a view needs them.
3. The content slots (§35's content node rendering) once the adapter can accept
   per-kind attributes: today it makes its own elements, and §36 keeps Mixins out
   of the editable subtree.

---

# 121. Mark and node rendering

§115 left one rendering gap: a mark definition may carry props, and nothing renders
them. A Link mark — the design's own example — exports and displays as
`data-marks="Link"` rather than `<a href="…">`, in all three interpreters, because
each hard-codes the three shipped marks and falls back to names on a span.

§34 already decided where the mapping lives: not in the Kit, which is data and never
holds renderers, but in a value built over one. It did not decide the entry's shape,
and that is the whole question, because three interpreters consume it:

```text
toHtml(blocks)            the core serializer, DOM-free   → a tag and attributes
renderDocument(document)  the read-only view              → the same, as Html
mount(ownerDocument, …)   the editable adapter            → the same, as DOM
```

So an entry is data about an element, not a view:

```ts
interface Rendering {
  /** The element the runs carrying this mark nest in. */
  readonly tag: string
  readonly attributes: Readonly<Record<string, string>>
}

const renderer = rendering({
  marks: {
    // A function because a mark's attributes come from its props (the core's
    // `markProps`), and an expression language for that would be a language to
    // maintain.
    Link: mark => ({ tag: 'a', attributes: { href: String(markProps(mark)?.href ?? '') } }),
    Highlight: mark => ({ tag: 'mark', attributes: { 'data-tone': String(markProps(mark)?.tone ?? '') } }),
  },
  nodes: {
    Callout: { tag: 'aside', attributes: { 'data-callout': '' } },
  },
})
```

`{ tag, attributes }` is the smallest shape all three can use: the serializer writes
it, the view maps it to `h[tag]`, and the adapter creates it. The core gains neither
a Foldkit nor a DOM dependency, and a function only *computes* the data.

A name with no entry keeps today's behaviour: the shipped three nest in
`strong`/`em`/`code`, and anything else rides on `data-marks`. That is also what
keeps the slice format and the HTML fallback lossless rather than lossy.

## The adapter changes shape, and that is the risk

The read-only view already nests marks as elements. The adapter instead writes their
names into one `data-marks` attribute on the run's own element, because its
selection mapping reads a run's text node. Nesting mark elements *inside* the run
element keeps both: `data-run` stays on the outer element, the text stays deepest,
and `rangeToPosition`'s `closest('[data-run]')` still finds the run, so the offset
maths is untouched. What does change is `patch`, which re-renders a run element, and
the nested-render recursion it shares with a block's children.

That is why the adapter slice is the one to prove: position mapping and a whole
editing loop through a *prop-carrying* mark, not a snapshot of its markup.

## Slices

1. `rendering(...)` and `toHtml(blocks, renderer?)` in `foldkit-richtext`: a Link
   exports as `<a href>`, and a name with no entry still exports as `data-marks`.
   — **done**: the registry, `noRendering`, the shared `runRendering` /
   `nodeRendering` lookups, and refusal of a malformed tag or attribute name.
2. `renderDocument(document, renderer?)` / `renderBlocks(blocks, renderer?)` in
   `foldkit-richtext-dom/view`, against the same renderer. — **done**. Foldkit types
   one builder per tag name and publishes no builder for an arbitrary tag, so the
   view looks the name up and *reports* one it cannot build; the serializer and the
   adapter take any tag, and that asymmetry is Foldkit's, not the registry's.
3. The adapter: marks nested inside the run element, `mount`/`patch`/`repair`
   through the renderer, and the selection tests that prove nothing moved. — **done.**
   `EditorDom` carries the registry, `patch` and `repair` reuse it, `textNodeOf`
   descends to the text node, and `repair` now compares a run's mark structure (and
   its `data-marks`) so a browser that splits a mark element is repaired rather than
   believed. `mountInto` and `attachEditor` take the registry too, and §122 carries it
   the last step into the editor Bundle, whose mount reads it by host id.
4. Node kinds in the registry, once Phase 7 declares a kind that needs more than a
   `div`. — **done**, in the adapter, because nothing else read `nodes` unevenly:
   the serializer and the read-only view already rendered a declared kind as its
   element, while the editable adapter created a `div` and ignored the entry. All
   three now agree, so a kind is declared once and rendered the same way in each.

## The element is part of the block's shape

`patch` keeps an existing element when the document still says the same runs and
nested blocks are there, because rebuilding a block is what it exists to avoid. But
run ids are not the whole shape: a block can keep its identity and every run while
the element it renders as changes. `RichText.Edit.retypeBlock` does exactly that — it
re-levels a heading in place, so `h2` becomes `h3` with the same two runs — and a
declared node kind whose entry changes the tag is the same case, which is what made
the gap visible once the registry reached the adapter.

So both routes compare the element: `patch` decides to keep a block only when the
element still is what the block renders as, and `repair` treats a block as drifted
when it is not. Text, marks, run ids and child ids were already compared; the tag
now is too, and a rebuilt block takes its runs with it, as any re-render does.

---

# 122. Getting a renderer to the editor Bundle

§121 left one thing undone, and it is a decision rather than a parameter: `mount`,
`mountInto`, and `attachEditor` take a registry, and the editor Bundle — the only
bundled way an application mounts an editor — does not, so an application's Link
still renders as `data-marks` in the editable area.

The reason it is a decision is that both paths into the Bundle are schema-decoded:

```ts
args: Schema.Struct({ hostId: Schema.String })          // Bundle.make
args: { content: RichText.Document }                    // Mount.defineStream
```

and a registry holds *functions*. Probed, not assumed: `Schema.Unknown` round-trips a
function through both `decodeUnknownSync` and `encodeUnknownSync` unchanged, so an
`Unknown` field could carry one.

That is still the wrong place to put it, for the reason the package already states:
a Model holds state, and this is a vocabulary — a definition, like the Kit. A registry
in `EditorView` would travel through devtools and time travel as a bag of closures,
and `editorAt(hostId, { rendering: registry })` would make every placement's *args* carry a
value
the schema cannot describe, typed `unknown` and cast at the boundary.

So the registry registers where the package already keeps per-placement state: the
host. `editorAt(hostId, { rendering })` records it for that id and the mount looks it up
when `events` executes — the shape `host.ts` already uses for attachments, with the
id standing in for the element because the placement happens before the element
exists. Nothing enters the Model or the args, the mount keeps its default when no
registry was placed, and a re-placement of the same id replaces the entry rather
than accumulating one.

The one risk to keep visible: the map is keyed by host id and is bounded by the
placements an application makes, not by mounts, so a view that places a distinct id
per row keeps one small record per row it has ever placed. That is acceptable for a
per-id registry written by the view's own author, and it is the reason this does not
become a general-purpose service location.

An earlier draft of this section had `releaseMount` forget the entry, to bound the
map by mounts instead. That is wrong, and the tests now say why: a placement is the
application's, so a host that unmounts and mounts again — a route returning, a row
re-rendered — reads its id a second time, and forgetting would render that second
mount with the default. The record belongs to the placement, not to one mount of it.

Slices:

1. `host.ts` gains `placeRendering(hostId, rendering)` and `renderingFor(hostId)`.
   — **done**, and a release deliberately keeps the record.
2. `events` reads the registry for `element.id` and hands it to `attachEditor`;
   `editorAt(hostId, { rendering })` places it. — **done.**
3. A test that a Link placed through `editorAt` renders as `<a href>` in the editable
   subtree, and that a mount with no placement keeps the default. — **done**, plus a
   re-mount after a release, which is what caught the forgetting.

Implemented as decided, with one detail the code settled: `editorAt` always places,
defaulting to `noRendering` when given none, so "re-placement replaces" needs no
special case.

---

# 123. Where the menu's keys go

§119's slice 3 said the editor's own binding layer — `events` taking a keymap whose
bindings emit Messages — was how a slash menu's ArrowUp/Down, Enter, and Escape would
work. Building it showed that this is the wrong shape, and what the tree already has
instead. It is recorded here because the reasoning is easier to lose than the code.

## An unconditional chord-to-Message table cannot work

`events`' args are decoded once, when the mount acquires, so a binding table is fixed
for the life of the host. A bound chord would then be intercepted whether or not the
editor wanted it: bind ArrowDown and every ArrowDown in the editor is `preventDefault`ed,
so the caret can no longer move down. The menu needs those keys *only while a query is
live*, and that condition changes without the mount re-running.

Making the condition live needs a predicate reading state the listener does not have: a
mount holds an element, not the Model, so the predicate would have to be placed like the
rendering registry (§122) *and* still reach the runtime's state, which it cannot. Placing
the handler in the view instead is what the framework already does:
`h.OnKeyDownPreventDefault((key, modifiers) => Option<Message>)` is a bubble-phase handler
whose closure the view re-creates every render, so it sees the current Model and returns
`Option.none()` when the key is not its business — and nothing is prevented.
`foldkit-primitives` builds on exactly that (`ListNavigation`, `RovingTabindex`).

Two consequences settle the layers:

- **No `events` keymap.** The editor's Events stay what the adapter produces plus the
  Messages an application sends itself (`RetypedBlock`), which is what §118 built. A
  second, imperative listener for the same job would be a second way to do it, and it
  would exist only to win a race against the adapter — a race a view-level handler never
  has to run.
- **Enter needs no interception.** The adapter already reports it as `Entered`, and what
  Enter *means* is the editor's decision (§118): with a live query at the caret, `update`
  chooses the highlighted entry instead of splitting the block. One Message, one decision
  point, no ordering question.

## What the menu is, then

Its query is not state: it is a read of the document. `textBefore(document, selection)`
against the pattern a slash command opens with says whether the caret is in a query and
what filters it, which is why the condition above can be computed *in the view*. What is
left to own is the highlighted entry — one value, and it belongs beside the editor's
(`EditorState`), because the editor's `update` is what resolves Enter.

The list behaviour is `foldkit-primitives`'s, but not `ListNavigation`'s. Its Bundle
owns a *typeahead* query and an expiry Command, and printable keys are its business —
while a slash menu's query is the document's text before the caret and printable keys
must keep typing into it. Adopting it would swallow those keys and keep a second query
beside the document's. What the menu needs is only the movement rule, and that is
`RovingTabindex.move`: pure, over the enabled indices, `current = -1` landing on the
first or last item, Home/End, PageUp/PageDown clamping at the ends, loop optional, and a
modified key moving nothing. So neither primitive changes; the menu composes `move` with
`slashMenu`.

That composition is a view question, and it is why the menu belongs in
`foldkit-mixins-richtext` — the family that already owns the editor's chrome (§120) —
rather than in `foldkit-richtext-dom`, which stays the adapter and its reads.

## The chord dialect stays two, for now

`foldkit-primitives/events/hotkeys` matches `ctrl+shift+k`; the adapter matches `Mod-b`,
where `Mod` is Meta *or* Control, because the adapter's `keymap` is a platform-agnostic
*editor* contract whose chords ship with the editor, while a hotkey pattern is application
policy. So the two dialects are deliberate for now and the matcher stays private to the
adapter. Unifying them is an open question, not a duplicate to delete quietly: it means
either an adapter dependency on `foldkit-primitives` (and its Mixins weight) or a breaking
change to a published chord dialect.

Slices:

1. Nothing to build for the editor's bindings: §119 slice 3 is dropped, not deferred.
2. `foldkit-mixins-richtext` gains the menu as a slot view: entries from
   `slashEntries`, movement by `RovingTabindex.move` (not `ListNavigation`, whose
   typeahead would swallow the keys that must keep typing), and a container whose
   `OnKeyDownPreventDefault` handles those keys only while a query is live.
   — **the vocabulary and the view landed**: `slashQuery`, `slashEntries`,
   `matchingEntries`, `slashMenu`, `slashMove`, and `SlashMenuSlots` /
   `slashMenuView<Message>()` in `packages/mixins-richtext` (the package depends on
   `foldkit-primitives` for `RovingTabindex.move`). The keys stay the application's
   (`OnKeyDownPreventDefault` while a query is live), so nothing is left here.
3. `EditorState` gains the highlighted entry, and the Bundle's `update` resolves
   `Entered` against a live query before it splits. — **done, with a correction to the
   plan above.** The catalogue did not descend into `foldkit-richtext`; it went to
   `foldkit-richtext-dom/editor`, beside the Messages it is made of. The Bundle is in
   that package, so it can import the entries — and, the reason the command version was
   the wrong shape, an entry can then carry the *editor Message* that chooses it, so
   `update` handles that Message as if it had arrived. A mark entry then
   updates the caret's stored marks through the path a toggle already uses, a refused
   entry is refused there too, history groups it the same way, and the patch Command is
   the same one. Running a command directly would have needed a second copy of the
   stored-mark and refusal logic beside the Message path — the second resolver §117
   keeps out of the pipeline.

   `EditorState`/`EditorView` gain `menuIndex`, the one thing a menu owns; the
   application moves it with `slashMove` and the editor reads it. No new Message is
   needed: the index is interaction state the parent owns, and the Link re-projects it.

   Choosing an entry removes the query it was typed into and applies the choice as one
   action (§124 §5), so one transition and one undo step cover both. What is still open:
   the editor resolves Enter whenever the caret's text opens a query, so an application
   cannot switch the menu off, and a per-placement catalogue (so an application can
   contribute entries, §124 §11) is not built yet.
4. The skill and an example (the harness or a small demo) drive it.



# 124. A Markdown-first roadmap

> **A proposed reordering, recorded 2026-09-25.** §115 remains the inventory of what
> exists; this section is the recommended sequence for what to build next, and it
> deliberately puts Markdown before collaboration. It is a plan, not a status report:
> nothing here is implemented unless §115 or a later note says so.

The argument is that Markdown is the forcing function which finishes the rest of the
architecture. Lexical is prior art for the boundaries — its Markdown work separates
block, multiline, text-format, and text-match transformers, its experimental mdast path
drives import, export, and shortcuts from one micromark/mdast grammar, and its code
support is separate from Prism/Shiki — not for its editor runtime. The current
implementation already has the pieces this builds on: semantic commands, nested blocks,
mark props, rendering registries, `Input.bundle`, CMS authored-change reporting, and the
real DOM editor.

## The north-star architecture

I would aim for this:

```text
                           RichText.Kit
                    semantic vocabulary/rules
                              │
                              ▼
                     RichText.Document
                              │
       ┌──────────────────────┼─────────────────────┐
       │                      │                     │
       ▼                      ▼                     ▼
 Rich DOM editor        Markdown interpreter      tooling
       │                parse / print / rules       │
       │                      │                     │
       │               Markdown source mode         │
       │                      │                     │
       └──────────┬───────────┴───────────┬─────────┘
                  │                       │
                  ▼                       ▼
          semantic Commands         Decorations
                  │                 syntax / lint /
        ┌─────────┴─────────┐       search / cursors
        ▼                   ▼
 local backend        replica backend
 Transactions         convergent changes
        │                   │
        ▼                   ▼
      Model           Sync / Durable
        │
        ▼
 Input.bundle / CMS / SSR
```

The rule I'd protect is:

> **Markdown is an interpreter and an editing language over `RichText.Document`; it is not a second document model.**

That single decision keeps everything Foldkit-native.

---

## 1. Build `foldkit-richtext-markdown`

This should be a DOM-free package depending on `foldkit-richtext` plus a real Markdown parser stack—I'd strongly lean toward **micromark + mdast**, rather than maintaining a home-grown Markdown grammar.

Lexical itself is now exploring exactly this direction with `@lexical/mdast`: one parser drives parsing, serialization, and shortcuts, while gaining CommonMark/GFM behavior rather than keeping multiple Markdown grammars synchronized. Importantly, Lexical still considers that new path experimental, so I'd borrow the architecture rather than depend on Lexical itself.

The API should feel like the existing rendering registry: interpreter definitions live **outside** the semantic Kit.

Something roughly like:

```ts
const ArticleMarkdown = Markdown.make(ArticleKit, {
  extensions: [
    Markdown.commonMark,
    Markdown.gfm,
  ],

  nodes: {
    Callout: Markdown.node({
      from: ...,
      to: ...,
    }),
  },

  marks: {
    Highlight: Markdown.mark({
      from: ...,
      to: ...,
    }),
  },
})
```

Then:

```ts
const result =
  Markdown.parse(
    ArticleMarkdown,
    source,
    ids,
  )

result.document
result.diagnostics
result.sourceMap
```

and:

```ts
const result =
  Markdown.print(
    ArticleMarkdown,
    document,
  )

result.markdown
result.diagnostics
```

The important symmetry is:

```text
RichText.Kit
    semantic validity

Rendering
    semantic → HTML/DOM

Markdown
    semantic ↔ Markdown

Loro backend
    semantic commands ↔ CRDT

Agent
    capabilities → semantic commands
```

None of these belong *inside* the Kit.

> **Built (2026-09-25), as §127.** `foldkit-richtext-markdown` exists both ways:
> `print(document)` returns `{ markdown, diagnostics }`, and `parse(markdown, { mint })`
> returns `{ document, diagnostics }`. Printing came first because it needs no parser;
> parsing then arrived with micromark/mdast and GFM's extension. §127 records the mapping
> and the escapes, and the round trip that tests the two directions against each other.

---

## 2. Give Foldkit a standard semantic content vocabulary

Markdown exposes that RichText still has a vocabulary gap.

I'd add either `foldkit-richtext-standard` or a standard subpath containing semantic definitions for:

```text
Paragraph
Heading
Quote

List
ListItem
TaskItem

CodeBlock
ThematicBreak

Table
TableRow
TableCell

Image
HardBreak

Bold
Italic
Strikethrough
InlineCode
Link
```

Not because Markdown owns these concepts—it doesn't—but because they are ordinary semantic document constructs that Markdown happens to represent.

Then:

```text
Markdown                    HTML
    \                       /
     \                     /
      ▼                   ▼
       Standard RichText
          vocabulary
```

Custom application Kits extend that:

```ts
const ArticleKit = RichText.kit({
  nodes: [
    ...Standard.nodes,
    Callout,
    ProductCard,
  ],

  marks: [
    ...Standard.marks,
    Highlight,
  ],
})
```

This finishes a lot of that ~80% structured-content bar at the same time.

### Important addition to Kit

Standard nodes will expose one missing semantic capability: **content rules more precise than `textContent` vs `blockContent`.**

A `CodeBlock`, for example, should probably say:

```text
accepts text
does not accept arbitrary formatting marks
has language metadata
```

A `List` should say:

```text
children must be ListItem
```

A `Table`:

```text
Table → TableRow → TableCell → blocks
```

So I'd add a small Kit-level structural constraint API rather than hard-code standard nodes into the editor.

> **Built (2026-09-25), as §125.** `standardNodes` and `standardMarks` are declarations in
> the main entry, and the constraint API is `blocksOf(...kinds)` on `children` plus
> `marks: 'none'` on a node; `validate` reports `UnexpectedChild` and `ForbiddenMark`.
> §125 records the decisions and the two boundaries it keeps — the rules are
> `validate`-level for now, and the codec never enforces a Kit.

---

## 3. Full CommonMark + GFM support

Don't call Markdown support “done” when headings and bold work.

The compatibility target should explicitly include:

```text
CommonMark
+
GFM:
  strikethrough
  autolinks
  tables
  task lists
```

Plus the practical editor features people expect:

```text
fenced code + language
indented code
hard line breaks
images
links + titles
nested lists
mixed ordered/unordered lists
blockquotes
thematic breaks
escaped punctuation
HTML policy
```

Every unsupported semantic conversion returns a diagnostic rather than silently throwing information away.

For example:

```ts
Markdown.print(profile, document)

// {
//   markdown,
//   diagnostics: [
//     {
//       type: "UnsupportedNode",
//       node: productCard.id,
//       kind: "ProductCard"
//     }
//   ]
// }
```

Applications could provide extensions:

```ts
ProductCard → :::product id="..." ...
```

but core never invents a syntax.

---

## 4. Markdown shortcuts should become first-class editor rules

This is where I would borrow heavily from Lexical's Markdown shortcut behavior, but make it Foldkit-native.

Typing:

```text
#␠
```

at the beginning of a paragraph should become:

```text
Paragraph("# ")
      ↓
Markdown input rule
      ↓
remove "# "
RetypeBlock(Heading(1))
```

Similarly:

```text
>␠       → Quote
-␠       → unordered List
1.␠      → ordered List
```␠     → CodeBlock
---⏎     → ThematicBreak
```

Inline:

```text
**foo**     → Bold
_foo_       → Italic
~~foo~~     → Strikethrough
`foo`       → InlineCode
[text](url) → Link
```

But **do not implement these as `Transform`s**.

Transforms currently mean canonical normalization:

```text
equivalent Text runs should merge
```

Markdown shortcuts are contextual user behavior:

```text
the user typed "# " at this particular moment
```

Those are different things.

I'd introduce a general, DOM-free editing concept such as:

```ts
interface InputRule {
  match(context): Match | undefined
  execute(match, context): EditorAction
}
```

Then:

```ts
Markdown.inputRules(ArticleMarkdown)
```

can supply them.

This also gives you a home later for:

```text
smart quotes
em-dashes
autolink
emoji replacements
@mentions
```

without turning normalization into a bag of UX behavior.

> **Built (2026-09-25), as §128.** The core has `InputRule` and `applyInputRules`; the
> Markdown package supplies `markdownInputRules` (`# ` through `###### `, which need only
> `RetypeBlock`); and the editor applies the rules placed for its host, so it carries no
> syntax. The markers that need a block wrapped or replaced — `> `, `- `, `1. `, a fence —
> wait on a command §21 does not have; §128 records both.
>
> **Built (2026-09-26), as §131:** `WrapBlock`, with the `> `, `- `, and `1. ` rules on it,
> and `ConvertBlock`, with the fence rule on it. Every block marker this list names is now a
> rule.

---

## 5. Add atomic `EditorAction` / command composition

Markdown shortcuts expose another missing primitive.

A Markdown shortcut frequently means **several semantic commands that must be one undo step and one replicated action**.

For example:

```text
delete "# "
+
retype Paragraph → Heading
```

I would therefore add a very small layer above individual commands:

```ts
const action = RichText.action([
  Command.deleteRange(...),
  Command.retypeBlock(...),
])
```

or a smart builder equivalent.

Semantics:

```text
EditorAction
    contains semantic Commands
    executes atomically
    creates one history unit
    produces one combined ChangeSet
```

Then both future backends can execute it:

```text
EditorAction
    ├── LocalBackend
    │     → one atomic Transaction/result
    │
    └── ReplicaBackend
          → one causal/convergent edit unit
```

This will be useful far beyond Markdown:

```text
slash commands
drag/drop
agents
table operations
smart paste
multi-block transformations
```

I think Markdown gives you enough real evidence to justify extracting this now.

> **Built (2026-09-25).** The primitive is `RichText.runAction(state, commands, ids,
> options?)`: an action is an ordered `ReadonlyArray<Command>`, run in sequence and
> committed once — one resulting state, one `ChangeSet` (the union of its commands'), and
> one identity stream. It stops at the first refusal and returns that command's error;
> state is a value, so nothing partial escapes. `runAction` with one command equals `run`.
>
> A range delete did not need a command of its own: `SetSelection` sets the range and
> `DeleteBackward` deletes it, so the sequence above is `[{ type: 'SetSelection',
> selection }, { type: 'DeleteBackward' }, command]`. The range is the read
> `RichText.textRangeBefore(document, position, length)` — the inverse of `textBefore`,
> covering the last `length` characters before a caret in its block, with endpoints landing
> at run boundaries at `after` affinity.
>
> First consumer: the slash menu (§123). Choosing an entry removes the query it was typed
> into and applies the choice as one action, so one transition and one undo step cover both;
> `packages/richtext-dom/test/editor-bundle.test.ts` drives the choice and the one-step undo.

---

## 6. Build the generic Decoration substrate

Before syntax highlighting.

This fills one of the most obvious remaining architecture gaps.

Something conceptually like:

```ts
Decoration.range({
  from,
  to,

  kind: "syntax",

  data: {
    token: "keyword",
  },
})
```

with:

```ts
type DecorationSet =
  ReadonlyArray<Decoration>
```

Decorations must remain:

```text
derived
ephemeral
not serialized
not part of undo
not CMS-authored content
not replicated
```

The DOM interpreter gets:

```text
Document
Selection
Decorations
```

and overlays them without modifying the document.

This immediately gives one infrastructure for:

```text
syntax highlighting
search results
spellcheck
lint diagnostics
AI suggestions
remote selections
remote cursors
comment highlights
```

That's a major architectural win.

> **Built (2026-09-25), as §126.** `Decoration`, `DecorationSet`, and `decorationsIn` are in
> `foldkit-richtext`, and the read-only renderer overlays a set as `span[data-decoration]`
> with the run's marks inside it. The editable interpreter's overlay is deliberately not
> built yet; §126 records the reason and the options.

---

## 7. Code blocks + great syntax highlighting

Follow Lexical's recent package split here.

Lexical now distinguishes code functionality from its Prism/Shiki implementations rather than baking one highlighter into the semantic code feature.

Foldkit should do the same.

Semantic document:

```text
CodeBlock {
  language: "typescript"

  Text(
    "const x = foo()"
  )
}
```

No:

```text
Text("const", Keyword)
Text("x", Variable)
```

Those are derived decorations.

Architecture:

```text
CodeBlock
    │
    ▼
code text + language
    │
    ▼
Tokenizer
    │
    ▼
DecorationSet
    │
    ▼
richtext-dom
```

I'd probably eventually expose:

```text
foldkit-richtext-code
foldkit-richtext-code-shiki
```

and perhaps Prism only if there is demand.

Shiki integration should:

```text
lazy-load grammars
cache by block/text/language/theme
cancel stale work
only re-highlight changed blocks
produce Decorations
never mutate Document
```

For synchronous/simple tokenizers, the same contract works without Effects.

For async Shiki, let a Bundle Command compute the highlighting and commit the ephemeral result into editor interaction state. Don't introduce a hidden highlighter store.

> **Designed (2026-09-25), as §130.** The seam and its homes are decided — `CodeTokenizer` and
> `codeDecorations` in the core (format-agnostic, like `searchDecorations`), a JSON lexer in
> `foldkit-richtext-code`, Shiki in `foldkit-richtext-code-shiki` — and §129 decides how the
> editable adapter draws the result. The core half is built: `CodeTokenizer` and
> `codeDecorations`, drawn by the read-only view. The JSON grammar and the editable overlay
> followed (see §130 and §129).

---

## 8. Rich Markdown source mode

Then build the thing that makes this feel like a **Markdown editor**, rather than a rich editor that happens to import `.md`.

Modes:

```text
Rich
Markdown
Split
```

I would make a `MarkdownEditor` orchestration Bundle, rather than complicating the semantic core.

```text
MarkdownEditor Model

mode
sourceDraft
sourceSelection
parseDiagnostics

RichText Editor Model
```

Crucially:

> Only one representation is actively editable at a time.

### Enter source mode

```text
Document
   ↓
Markdown.print
   ↓
sourceDraft
```

### While source editing

```text
sourceDraft
    ↓
Markdown.parse
    ↓
candidate Document
    ↓
preview
```

The Markdown string may temporarily be the source editor's local authority, just as IME text may temporarily be browser authority.

It is **not published content**.

### Return to rich mode

```text
valid sourceDraft
    ↓
parse
    ↓
replace semantic Document
    ↓
Rich editor
```

If conversion would lose unsupported semantics, surface that explicitly before switching.

This should be backed by `Input.bundle`, which now exists, so the whole editor can remain one Form control.

---

## 9. Preserve source formatting without contaminating Document

A truly good Markdown editor shouldn't turn:

```markdown
_hello_
```

into:

```markdown
*hello*
```

every time the user toggles modes unless it has to.

Lexical's new mdast experiment is interesting specifically because it preserves enough original syntax to minimize Markdown changes during serialization.

For Foldkit I'd add:

```ts
Markdown.SourceMap
```

or:

```ts
Markdown.RoundTripState
```

returned alongside parsing:

```ts
const {
  document,
  roundTrip,
} = Markdown.parse(...)
```

It can contain ephemeral hints such as:

```text
_ vs *
** vs __
bullet marker
ordered-list delimiter
fence character/length
heading style
source ranges
```

Then:

```ts
Markdown.print(profile, document, {
  previous: roundTrip,
})
```

can preserve syntax where semantics haven't changed.

Important:

```text
RichText.Document     persistent semantic content

Markdown.RoundTrip    editor-local interpreter state
```

Do **not** put Markdown trivia into semantic nodes.

If round-trip information is unavailable, emit canonical Markdown.

---

## 10. Upgrade HTML import at the same time

The current HTML importer deliberately ignores arbitrary attributes, which is a sound safety baseline—but it means pasted links from normal web content cannot become useful Link marks.

For a great editor, move to **Kit/interpreter-aware safe attribute import**:

```ts
HtmlImport.make({
  marks: {
    Link: {
      tag: "a",
      attributes: {
        href: Url.safe,
        title: String.optional,
      },
    },
  },
})
```

Still reject:

```text
onclick
style injection
javascript:
unknown arbitrary attrs
```

but allow known semantic attributes under explicit schemas/policies.

That brings HTML, Markdown, clipboard, and RichText into alignment.

> **Partly built (2026-09-25).** The importer now maps the standard vocabulary's elements
> — `blockquote`, `pre` (language from `data-language` or a `language-…` class, text
> verbatim, no marks), `hr`, `img` (`src`/`alt`), `table`/`tr`/`td`/`th`, `s`/`del`, and
> `a` — and reads only a
> fixed few attributes, each through `safeUrl`, which refuses a scheme outside
> http/https/mailto/tel after removing control characters (so `java\tscript:` cannot walk
> past it) and leaving a relative URL alone. A `th` now marks its row: `TableRow` carries a
> `header` prop, the importer reads a `th` cell or our own `data-header`, the rendering writes
> `data-header`, and the printer reports a header row GFM cannot place. What is still the sketch below: a per-Kit
> *declared* attribute schema (`HtmlImport.make({ marks: { Link: { attributes: { href:
> Url.safe } } } })`) rather than one fixed allowlist, and `title` on a link.

---

## 11. Finish the editor UX layer

Once Markdown shortcuts exist, the missing Phase-4 UI becomes much more useful.

Finish:

```text
editor Message keymap layer
slash/typeahead menu
floating selection toolbar
link popover/editor
block type picker
block handle
drag/drop
placeholder
status/diagnostic surface
command palette
```

The slash menu catalogue should not know how editing works.

Something like:

```ts
Slash.entry({
  id: "heading-2",
  label: "Heading 2",
  keywords: ["h2", "subtitle"],

  message:
    Editor.Message.RetypedBlock({
      type: "Heading",
      level: 2,
    }),
})
```

Then applications can contribute entries for:

```text
Image
Callout
Product
Embed
Diagram
```

without modifying RichText.

The menu itself should probably use existing/new Foldkit primitives for collection navigation, focus, and live announcements rather than implementing bespoke keyboard state.

---

## 12. Finish `Input.bundle` → RichText → CMS

The prerequisite is now built, so this should move much earlier than collaboration.

Expose the obvious integration:

```ts
const ArticleEditor =
  RichTextDom.editor(...)

const Body =
  RichText.input(ArticleEditor)
```

implemented internally as `Input.bundle`.

Then prove:

```text
type
autosave
refresh
resume draft
preview
publish
revision
restore
scheduled publish
```

in `examples/cms`.

Explicitly decide what resumed editor state contains:

```text
Document             yes
selection            probably yes
stored marks         yes
bounded history      probably
composition          no
focus                no
drag state           no
DOM handles          never
```

Version editor-resume state separately from the published document.

This should take the RichText↔CMS bar from ~30% to essentially complete.

---

## 13. SSR/resumability

I'd also make the RichText DOM package cooperate directly with `foldkit-ssr`.

Server:

```text
Document
   ↓
read-only/editor-host HTML
```

Client:

```text
existing DOM
   ↓
adopt / index
   ↓
editable RichText interpreter
```

rather than blindly deleting and rebuilding SSR output.

That suggests something like:

```ts
RichTextDom.adoptInto(
  host,
  document,
  renderer,
)
```

which verifies the existing subtree and builds the identity map around it.

This would fit Foldkit's resumability direction much better than a client-only editor island.

---

## 14. Browser hardening becomes a release gate

Before calling the editor “great,” add Playwright coverage for:

```text
Chromium
Firefox
WebKit
```

plus mobile emulation.

Test especially:

```text
IME commit/cancel
emoji / surrogate pairs
grapheme deletion
autocorrect
Android-style beforeinput
selection direction
triple click
copy/cut/paste
drag/drop
undo
spellcheck mutation
nested blocks
links
code blocks
markdown shortcuts
```

Lexical's continuing 2026 work still contains numerous IME, composition, selection, rich-text, Markdown, and code-highlighting fixes; that is a good reminder that browser editing correctness is a permanent subsystem rather than a one-time implementation task.

Add fuzz/property tests too:

```text
parse(print(document))
    ≈ semantic document

print(parse(markdown))
    ≈ same Markdown semantics

apply(transaction)
    never leaves invalid structure

DOM patch
    never changes semantic state
```

---

## 15. Then do collaboration

At that point I would finally start the Loro backend.

Not before.

The single-user command vocabulary will then have been tested by:

```text
human typing
markdown shortcuts
slash commands
drag/drop
source mode
tables/lists
agents eventually
```

which is exactly what you want before freezing the command boundary for a second backend.

Build:

```text
RichText.Backend
    ├── Local
    └── Replica
```

Conceptually:

```ts
interface EditResult {
  document: Document
  changeSet: ChangeSet
}

interface LocalResult
  extends EditResult {
  state: EditorState
}

interface ReplicaResult
  extends EditResult {
  replica: ReplicaState
  change: RichTextChange
}
```

Then:

```text
Loro adapter
    ↓
foldkit-sync
    ↓
foldkit-durable
```

with no mutable Loro instance becoming invisible authority.

The sequence remains:

```text
plain collaborative text
marks
stable selections
offline/reconnect
structured nodes
collaborative undo
presence
```

---

## 16. Presence + first-class Annotations

Once stable collaborative anchors exist, implement the distinction we already designed:

```text
Mark
    Bold / Link / InlineCode

Annotation
    Comment / Suggestion / Citation

Decoration
    syntax / search / cursors / lint
```

An Annotation owns:

```text
id
stable range
kind
props
lifecycle
```

A comment may project:

```text
Annotation
    ↓
Decoration highlight
```

but the highlight itself is not persistent.

Presence similarly becomes:

```text
StableSelection
    ↓
Decoration
```

over Sync's existing ephemeral presence channel.

This gets the annotations/decorations and presence bars to 100% without confusing their lifetimes.

---

## 17. Agent integration last, but it will become very easy

Once the semantic command catalogue is good, Agent integration should almost fall out.

Expose things such as:

```text
replace_selection
toggle_mark
set_link
retype_block
insert_heading
insert_callout
insert_code
move_block
insert_table
```

Agents emit the same `EditorAction`s humans do.

For proposed edits:

```text
Agent proposal
      ↓
Decoration
      ↓
Accept
      ↓
semantic EditorAction
```

That is a particularly elegant fit with the Decoration work.

No agent gets:

```text
innerHTML
raw DOM mutation
raw CRDT bytes
```

---

## How I'd reorder the actual roadmap

The concrete order I would use from current `main` is:

| Order | Milestone | What it unlocks |
|---|---|---|
| **1** | Standard content Kit + remaining semantic constraints | Complete document vocabulary |
| **2** | Decoration substrate | Syntax, search, diagnostics, AI, presence |
| **3** | `foldkit-richtext-markdown` parse/print | CommonMark/GFM interoperability |
| **4** | Markdown input rules + atomic EditorActions | Real Markdown-native rich editing |
| **5** | CodeBlock + Shiki Decorations | Great code experience |
| **6** | Slash/keymap/link/block UI | Finish Phase 4 UX |
| **7** | Markdown source/split mode | Full Markdown editor |
| **8** | RichText `Input.bundle` integration + CMS example | Real authoring application |
| **9** | SSR adoption + browser/a11y hardening | Production-quality single-user editor |
| **10** | Loro replica backend | Collaboration |
| **11** | Sync/Durable + structured CRDT | Offline collaborative docs |
| **12** | Presence + Annotations | Comments/cursors/suggestions |
| **13** | Agent capabilities | Human/AI unified editing |

And that turns the rough progress picture into:

```text
Semantic core             90% → 100%   milestones 1–4
Transactions/commands     90% → 100%   4
Structured content        80% → 100%   1, 5
DOM editor                80% → 100%   6, 9
Editor Bundle             70% → 100%   4, 6
HTML/clipboard            80% → 100%   3, 6, HTML-policy work
Editor chrome             40% → 100%   6
Form integration          90% → 100%   8
RichText/CMS              30% → 100%   8
Markdown                  10% → 100%   3, 4, 5, 7
Annotations/Decorations   20% → 100%   2, 12
Collaboration              0% → 100%   10, 11
Presence                   0% → 100%   12
Agent editing             20% → 100%   13
```

The most important strategic change is that **Markdown should come before collaboration**. Markdown, source mode, syntax highlighting, slash commands, code blocks, tables, links, and real CMS authoring will put far more pressure on the semantic command/document boundaries than another round of design review will. If those all remain clean, then the CRDT backend will be adapting a mature editor semantics rather than helping define them.

And the end state is quite compelling: not “Foldkit has a rich-text widget,” but **Foldkit has a semantic document/editor platform with Markdown, HTML, SSR, CMS, source editing, code highlighting, collaboration, annotations, and agents as interoperable interpreters and producers around one Foldkit-owned model.**

---

# 125. The standard vocabulary and content rules

§124 §2 asks for a standard semantic vocabulary and for rules stricter than
`textContent` versus `blockContent`. Both are built; this records where each lives and
what it deliberately does not do.

## The vocabulary

`foldkit-richtext` exports `standardNodes` and `standardMarks` — declarations only, no
renderers and no executable code (§34) — and an application spreads them into its Kit:

```ts
RichText.kit({
  nodes: [...RichText.standardNodes, Callout],
  marks: [...RichText.standardMarks, Highlight],
})
```

`standardNodes` is `Paragraph`, `Heading`, `Quote`, `List`, `ListItem`, `TaskItem`,
`CodeBlock`, `ThematicBreak`, `Image`, `Table`, `TableRow`, `TableCell`. `standardMarks`
is the shipped `Bold`/`Italic`/`Code` plus `Strikethrough` and `Link`, whose `href` is a
prop so the serializer renders a real `<a href>` (§121).

Three decisions worth keeping:

- **`Code` is the inline-code mark, so there is no `InlineCode`.** A second name for the
  same meaning is a second vocabulary to keep in step, and `shippedMarks` already had it.
- **`HardBreak` is absent.** It is inline content, and the model has no inline atoms
  (§116, deferred); declaring it would promise a shape the codec cannot hold.
- **The vocabulary lives in the main entry, not a subpath or a new package.** It is
  semantic data with the same dependency shape as `shippedMarks` and nothing consumes it
  differently; a `foldkit-richtext/standard` subpath is a cheap move if that changes.

`standardRendering` is the companion half: the element each kind is, with the props that
belong in attributes read from the block — a `Link` is an `<a href>`, an `Image` carries
its source, a `List` is an `<ol>` when it is ordered, with where its numbering starts, or a
`<ul>` when it is not, and a `TableRow` that is the header renders `data-header`. The shipped marks already nest in `strong`/`em`/`code`; this adds the
two that do not. `renderingOver(base, extra)` builds a registry over another, so an
application extends the standard look without restating it. Two small things came with it:
`List` gained `ordered`/`start` props for the two list forms Markdown distinguishes, and
the serializer now leaves a void element (`img`, `hr`) open rather than writing
`<img></img>`.

Declaring the kinds without this would have left every one of them rendering as `<div
data-node="Kind">`; a vocabulary an application still has to hand-render is half a
vocabulary.

## Content rules

A kind's `children` may now be a constraint rather than only a mode, and a node may
declare that its runs carry no marks:

```ts
RichText.node('List', { children: RichText.blocksOf('ListItem', 'TaskItem') })
RichText.node('CodeBlock', { Props: Language, children: RichText.textContent, marks: 'none' })
```

`blocksOf(...kinds)` is block content restricted to those kinds; `marks: 'none'` forbids
every mark on the kind's own runs. `validate` reports two new diagnostics:
`UnexpectedChild` (the offending child's id, its kind, and the kinds the parent accepts)
and `ForbiddenMark` (the mark, and the kind that forbids it). `atom` now takes `Props`, so
an `Image` is an atom carrying a source rather than a run holder that happens to be empty,
which `validate` checks the same way.

**The rules are enforced in both places a violation can begin.** `validate` reports a
document against a Kit; `run` refuses the edits that would create those documents when a
caller gives it the vocabulary — `RichText.nodeRegistry(kit.nodes)` as the `nodes`
option, the node counterpart of the mark registry. A `ToggleMark` that adds a mark over a
run in a mark-free kind, and an `InsertText` carrying marks into one, are refused as
`ForbiddenMark`; a `RetypeBlock` or a `Paste` that would put a kind a constrained parent
excludes into it is refused as `UnexpectedChild` — the same names `validate` reports, so
one vocabulary answers both questions.

Three boundaries are deliberate:

- **A constraint is checked, never enforced by the codec.** `decodeDocument` keeps a
  document a Kit would reject, because the codec cannot know a Kit — the same separation
  as unknown kinds and props.
- **Removing a mark is always allowed, even from a mark-free kind.** The rule is about
  adding; a preserved document that already carries the mark has to have a way back to
  validity.
- **`apply` still takes no vocabulary.** A durable transaction must not depend on a
  declaration that may have moved (§117). `run` is where the caller's Kit is known, and
  a caller that applies operations directly keeps `validate` as its check.

`validate`'s block loop became one path along the way: a preserved block, an application
node, and a built-in block now share one declaration lookup and one report, which is what
let the two new checks sit beside the existing ones instead of in a second walk.

The editor Bundle places the vocabulary the way it places a rendering registry (§122):
`editorAt(hostId, { rendering, vocabulary, inputRules })` records all three for that host id
and
the child's `update` reads it, so an application using the Bundle gets `run`'s refusal and
not only `validate`'s report. `foldkit-richtext-dom/host` exports `placeVocabulary` and
`vocabularyFor`, and for the same reason the rendering pair lives there: the registries
hold schemas and functions, so they cannot ride in the Bundle's schema-decoded args.

---

# 126. The Decoration substrate

§64 decided that a Decoration is the ephemeral third kind beside Marks and Annotations,
derived from current state and never persisted. §124 §6 asked for the substrate that makes
that real before syntax highlighting needs it. Both are built; this records the shape and
what is deliberately not here.

## The contract

`foldkit-richtext` exports `Decoration`, `DecorationSet`, and `decorationsIn`:

```ts
interface Decoration<Data = unknown> {
  readonly from: Position
  readonly to: Position
  readonly kind: string // search, syntax, cursor, lint, …
  readonly data?: Data // the renderer's payload; the core never reads it
}
```

A decoration is plain data over a document range, computed for one render and then
discarded — not in the codec, not in a Transaction, not in undo, and not replicated.
`kind` is a fixed word the presentation is chosen by; `data` is the renderer's own.

`decorationsIn(document, set)` projects a set onto runs:

```text
ReadonlyMap<NodeId, ReadonlyArray<{ from: number; to: number; decoration }>>
```

A decoration that crosses runs is cut at each run's edge, so a renderer never has to reason
about document order; a decoration whose endpoints do not resolve is skipped rather than
guessed at; a backwards range is honoured; an offset past a run is clamped; and one run's
spans come back in text order. The projection lives in the core because a read-only
renderer, the editable adapter, and any other interpreter need the same answer to "which
decorations cover this run, and where".

## The first renderer

The read-only view takes a set — `renderDocument(document, renderer?, decorations?)` — and
renders each covered piece as a `span` with `data-decoration=<kind>`, with the run's marks
*inside* it, so a stylesheet reaches both:

```text
<span data-decoration="search"><strong>covered</strong></span>
```

A run no decoration covers renders exactly as it did before. `renderBlocks` is unchanged: a
slice's positions cannot be resolved without the document they came from, so only the
document form takes a set.

## What is not here

A producer ships with the substrate too: `searchDecorations(document, query)` returns every
occurrence of a query as a `search` decoration — one per occurrence, a match across two runs
kept whole, and none across two blocks — with `positionInBlock(block, offset)` as the read it
shares with `textRangeBefore`, the block-offset-to-position mapping both need. The read-only
view draws such a set without any hand-made decoration, so §64's first example now runs end to
end.

The **editable** adapter did not overlay decorations at first (built since; see §129). Its runs mapped a caret by keeping one
text node per run, and splitting a run at decoration edges breaks that mapping unless the
mapping learns to read across the text nodes. §129 decides that: the adapter nests the same
elements the view does and the mapping concatenates a run's text nodes, rather than the CSS
Custom Highlight API, which nothing in this repository can test. Until the overlay lands the
editable subtree renders marks only.

Presence (§62) and remote selections (§63) become decorations when collaboration lands;
nothing here changes for that — a stable selection resolved against a replica produces a
`Decoration`, which is the point of resolving it.

---

# 127. The Markdown interpreter, printing first

§124 §1 asks for `foldkit-richtext-markdown` over a real parser stack. The package exists
and prints; parsing is the next slice. This records why the order is print-first and what
the mapping does with each shape.

## Both directions, printing first

Parsing needs `micromark`/`mdast` — a dependency and a package that cannot build without
it. Printing needs nothing, and it is a product surface on its own: Markdown export, and
the source mode §124 §8 describes. So printing landed first and parsing followed with the
stack — `mdast-util-from-markdown` and GFM's extension, the one grammar §124 §1 asked for,
so both directions answer to the same parser rather than two grammars kept in step.

`print(document)` → `{ markdown, diagnostics }`; `parse(markdown, { mint })` →
`{ document, diagnostics }`, with identities from the caller as everywhere else. The
document a parse builds goes through `decodeDocument`, so a bad construction fails loudly
instead of reaching an editor.

There is no profile yet: a profile is for custom syntax, and custom syntax needs both
directions at once, which is when the first application declares one.

## What the mapping does

CommonMark, plus GFM's lists, tasks, strikethrough, and tables:

```text
Paragraph, Heading          the text; # … ######
Quote                       > on every line, blank ones included
List, ListItem, TaskItem    -, 1., - [x]; a nested block stays aligned under its marker
CodeBlock                   a fence, its language, the text verbatim, a fence longer than
                            any backtick run inside it
ThematicBreak               ---
Image                       ![alt](src), on its own line
Table, TableRow, TableCell  a GFM pipe table, first row as the header (`TableRow.header`)
Bold, Italic, Code,         **, *, backticks, ~~, [label](href); the link is outermost,
Strikethrough, Link         decided by a rank table rather than a chain of tests
```

Text is escaped so it cannot become markup: a backslash before an inline delimiter, and
before a block marker — or a `1.` — that would open a paragraph's line; a leading space
becomes `&#32;`. A code span skips the escape step, because a backslash inside one is
literal, and its fence grows past any backtick run in the text.

## Diagnostics, not silence

`diagnostics` names every kind or mark the mapping has no syntax for. A *block kind* with
none prints its content rather than losing it, which is what §3 asks: an interpreter
reports what it cannot express instead of discarding rich content. A preserved `Unknown`
block is reported and skipped, because its payload is opaque and printing it would invent a
shape. A mark with no syntax is reported and its text kept. A link with no `href` is
reported, because there is nothing to link to.

The two directions are tested against each other: `print(parse(markdown))` returns the
Markdown and `parse(print(document))` a document that prints the same — §124 §14's
property, without a second parser to trust. What the model cannot hold, parsing reports
too: raw HTML, a link definition, a footnote, and a hard line break (which ends the
paragraph, because a block holds no break).

## Limits worth naming

- **A table's header row.** The model does not say which row is one, so the first is printed
  as it — which is how GFM reads a table. Making it explicit is a vocabulary decision for
  the GFM work.
- **Inline atoms.** The model has no inline image or break, so a block `Image` prints as its
  own line and a paragraph holding only an image is hoisted back to an `Image` block; an
  image among other content is reported and skipped. The asymmetry belongs to §116's
  deferred inline content.

---

# 128. Input rules

§124 §4 asks for Markdown shortcuts as editor rules rather than as Transforms. The core now
has the contract and the composition, the Markdown package has the block rules the
vocabulary can carry out, and the editor applies whatever its placement gives it.

## The contract

```ts
interface InputRule {
  readonly name: string
  readonly match: (textBefore: string) => InputMatch | undefined
}

interface InputMatch {
  readonly remove: number
  readonly commands: Action
}
```

A rule is a pure read of the text before the caret: it sees that text and nothing else, so
it cannot depend on a selection, a clock, or the Model. `remove` is how many characters it
consumed; `commands` is what to do. `applyInputRules(rules, { textBefore, text, insertion })`
returns the whole action — the insertion, one `DeleteBackward` per consumed character, then
the rule's commands — so one transition and one undo step cover typing the marker and the
change it made.

Consumption is by deleting backwards rather than by a range. A range would have to be
computed against a state the *earlier* commands have not produced yet: `# ` is only in the
document after the insertion that completes it, so a range read before that is the wrong
range, and the command layer has no way to say "delete what this action is about to insert".
The deletes resolve one at a time as the action runs, which is what `runAction` is for
(§124 §5).

## It is not a Transform

§23's transforms normalize a document whenever they run. A rule is about a moment: `# ` at
a block's start means "make this a heading" only when someone typed the space, and never on
a document loaded from storage or arriving from a peer. So the editor applies it at the
edit, and the transform layer is untouched.

## What is wired, and what is not

`foldkit-richtext-dom`'s Bundle applies the rules placed for its host (`placeInputRules` /
`inputRulesFor`, the same pattern as a rendering registry or a vocabulary), so the editor
carries no syntax of any format. `foldkit-richtext-markdown` supplies
`markdownInputRules`: `# ` through `###### `, which need only `RetypeBlock`.

The other markers need vocabulary that does not exist yet: `> `, `- `, `1. `, and a fence
each require the block *wrapped* in a container or *replaced* by an atom, and §21's
operation list has no wrap. That is a command to design — what a caret inside a block does
when its block becomes a child of a new one — not a rule to add, so those markers stay text
and no rule claims them. The inline shortcuts (`**foo**` as the closing run is typed) are the
same story from the other side: they need the text *after* the caret too, which the contract
deliberately does not read.

> **Since built (§131):** the wrap and the replace. `> `, `- `, `1. `, and the fence are
> rules now.

---

# 129. The editable adapter's decoration overlay

§126 recorded that the editable adapter does not overlay decorations, and named two ways it
could: the CSS Custom Highlight API, or elements the position mapping ignores. The first
decoration the editor will need is foreseeable — §124 §7's highlighting inside a `CodeBlock`,
and §124 §11's remote cursors — so this records the shape to take and why, before someone
writes it from a browser API's name.

## The evidence against the Highlight API

`CSS.highlights` is the browser's own answer and the cheaper one: ranges are registered by
name, `::highlight(name)` styles them, and the text nodes are untouched, so position mapping
keeps the invariant §126 gave for deferring. Two things decide against it here:

- **Nothing in this repository can test it.** Every DOM test runs in jsdom, which has no
  `CSS.highlights`, and this environment has no browser either. Code written against an API
  that cannot be run is code written from its name — the failure the repository's guidance
  names — and the adapter is the worst place to discover a wrong assumption. A browser-gated
  verification would have to come first.
- **One stylesheet should serve both interpreters.** The read-only view already renders a
  decoration as an element carrying `data-decoration=<kind>` (§126). `::highlight` would style
  the same decoration another way, so a stylesheet would need both, and what the editor shows
  and what the read-only view shows would be two implementations of one thing.

## The shape to take

The adapter nests the same element the view does — a `span` with `data-decoration=<kind>`,
inside the run element and outside the marks — and the position mapping learns to read a run's
text across it. That is the work §126 flagged as the reason to wait:

```text
renderRun        the run's text, cut at decoration edges, each piece in its marks and then
                 in the decorations covering it     (the view's logic, in DOM form)
rangeToPosition  a run's text nodes concatenated, so a browser offset is still an offset into
                 the run's text rather than into one of its nodes
positionToRange  the text node an offset falls in, and the offset inside that node
patch / repair   a run whose decorations changed is re-rendered, as one whose marks changed is
```

The invariant worth keeping is the one that made patching cheap: an untouched run keeps its
element and its text node. A decoration change *is* a run change, which the `ChangeSet` already
carries, so no new invalidation is needed — a run is re-rendered when the decorations over it
differ, exactly as it is when its marks do.

Two things this does not decide, and both can wait for the first decoration that needs them:
what a decoration's `data` renders as (today only its `kind` reaches the DOM, which is why a
tokenizer names its kinds `syntax-string`, `syntax-number` — a registry over `data`, like §121's
over marks, is the alternative), and whether the editable subtree should clip a decoration to
the rendered window.

> **Built (2026-09-26).** `mount` and `patch` take a decoration set and draw it as the view
> does, from one shared cut (`RichText.runPieces`), and the mapping reads a run's text nodes
> in order. One correction to the plan above: a decoration change is *not* carried by the
> `ChangeSet`. A new search query changes the decorations with no edit at all. So `patch`
> compares each run's share of the new set with what it drew and redraws the runs that
> differ; the same set again redraws nothing. `repair` compares a run with a fresh render of
> it, which covers decorations as well as marks.
>
> **Wired (2026-09-26).** A placement names `decorate(document) => DecorationSet`
> (`editorAt(hostId, { decorate })`, recorded by host id like the rendering, the vocabulary,
> and the input rules). The mount draws `decorate(content)`, and every `attachment.sync`
> draws `decorate` of the synced document. It reads the document and nothing else, which
> covers highlighting derived from the document (code, lint). A decoration derived from
> application state, such as a search query held in the Model, is not covered: it would need
> the set held in editor state and passed with the patch, which is undecided.

---

# 130. Where a code tokenizer lives

§124 §7 asks for code blocks with highlighting, kept apart from the highlighter: the document
holds `CodeBlock { language, text }`, tokens are *decorations*, and Shiki or Prism is one
implementation of them. Where each piece goes follows §126's precedent and decides the next
slice.

```text
foldkit-richtext              CodeTokenizer, codeDecorations(document, tokenizers)
                              (a pure read of the document, like searchDecorations)
foldkit-richtext-code         a JSON lexer, and room for a small set of exact grammars
foldkit-richtext-code-shiki   the Shiki adapter, and the only piece that needs a heavy
                              dependency and a Command to run off the render
```

The contract and the producer belong in the core because they are format-agnostic: a tokenizer
is a function from text to ranges, and `codeDecorations` reads `CodeBlock`s the way
`searchDecorations` reads text — no grammar, no dependency, nothing to load. A *grammar* is
format-specific, so it does not: `foldkit-richtext-code` holds the small exact ones, and Shiki's
weight and asynchronous loading justify their own package, with a Command that commits the
ephemeral result into editor interaction state rather than a hidden store (§124 §7).

The first grammar to ship should be JSON, by judgment rather than preference: its grammar is
small enough to write exactly and verify, it is common in CMS content, and it proves the whole
seam — a tokenizer, its decoration kinds, and the read-only view drawing them — without the risk
of a half-right JavaScript lexer. TypeScript and JavaScript should wait for Shiki rather than be
hand-rolled.


> **Built (2026-09-26): the core half.** `CodeToken`, `CodeTokenizer`, and
> `codeDecorations(document, tokenizers)` are in `foldkit-richtext`. The registry is a `Map`
> keyed by language, because the language is read from the document. A token outside its
> block's text, covering nothing, or at a fractional offset throws with the language, rather
> than becoming a highlight over the wrong text. The read-only view draws the result with no
> change of its own.
>
> **Built (2026-09-26): the JSON grammar.** `foldkit-richtext-code` exports `jsonTokenizer`,
> exact on JSON and total on anything else: it never throws, and an unterminated string ends
> at the line break. A key is `syntax-property`, told from a string value by the colon after
> it. The Shiki adapter remains; the editable overlay is built (§129).

---

# 131. Wrapping a block

§128 left `> `, `- `, and `1. ` as text because no command put a block inside a new container.
The question it named — what a caret inside a block does when the block becomes a child of a
new one — has a simple answer once the wrap is a *move*: nothing. The block keeps its identity
and its runs, so a position on one of its runs is still a position.

```text
WrapBlock { containers: [outermost, …, innermost] }
  = InsertNode(chain of empty containers, at the block's index, in the block's parent)
  + MoveNode(block, into the innermost container, at 0)
```

Both operations already existed (§21), so history, replay, and the change set needed nothing
new. The block acted on is `RetypeBlock`'s: the caret's, or the first a range covers.

Constraints are checked before anything is built, against the vocabulary when one is given:
the parent must accept the outermost container, each container the next, and the innermost
the block. A container is held to more than an existing parent is: it must be *declared* as
holding nested blocks. An existing parent the vocabulary does not know is left alone, because
refusing to edit inside it would strand its content; a new container in an undeclared kind, or
in a text kind such as `CodeBlock`, would be content the vocabulary itself refuses.

The Markdown rules on it: `> ` wraps in a `Quote`; `- `, `* `, and `+ ` in a `List` holding a
`ListItem`; `1. ` or `1) ` in an ordered list, whose `start` is the number typed and is left out
at 1, as the parser writes it.

Not decided here, and not needed until they are:

- **Joining a neighbour.** A list marker typed right after a list starts a second list beside
  it. The printer writes two lists, and a Markdown parser reads them back as one. Markdown's own reading would add an item to
  the list above; that is a merge of containers, which is its own command.
- **The fence** turned out to need a *replace*, not a wrap or a retype: see below.
- **Unwrapping.** Backspace at the start of a list item or a quote conventionally lifts the
  block back out. That is the inverse move and the same two operations, but it changes what
  `DeleteBackward` does, so it is a decision about Backspace rather than about this command.

## The replace, for the fence

A `CodeBlock` holds text under its own marks policy, and the `RetypeBlock` *operation*
deliberately refuses node kinds: a node's content is its Kit's contract. So turning a paragraph
into a code block is a replace, composed like the wrap from operations that exist:

```text
ConvertBlock { to: { kind, props } }
  = DeleteNode(block)
  + InsertNode(node of that kind, carrying the block's text and marks, where the block stood)
  + SetSelection(the old selection, moved onto the new runs at the same offsets)
```

One thing is different from the wrap. Carrying the runs over under their old identities was
the first attempt, and `apply` refused it (`InvalidInput`): an identity is never reused, even
one deleted earlier in the same transaction. So the block and its runs get new identities from
`mint`. The caret survives because the command moves it, not because the identities did, and
anything else holding the old run identities (a decoration, a remote cursor) has to find the
new ones. Widening the `RetypeBlock` operation to node kinds would have kept them, at the cost
of the rule that an operation never rewrites a node's content; a fence is rare enough, and
typed at the start of an empty block often enough, that the replace is the smaller price.

Given a vocabulary, the kind must be declared to hold text and its parent must accept it
(`UnexpectedChild`), and a kind whose marks policy is `none` refuses a block that carries marks
(`ForbiddenMark`) rather than dropping them silently. Only a paragraph or heading converts; a
node block's content stays its Kit's.

The rule completes a fence — three or more backticks or tildes, then an optional language —
with a space, since Enter splits a block and a rule sees only what is typed.

