# foldkit-richtext controlled-Bundle harness

A private feasibility harness, not a runnable example and not published. It
answers one question from the [Rich Text design](../../docs/design/richtext-DESIGN.md#27-the-document-and-editor-bundle)
(§27): can a rich-text editor be a Bundle whose authoritative document lives in
the parent, with one parent transition committing the document and the editor's
interaction state together?

There is no DOM, no persistence, and no collaboration here. `src/controlled.ts`
is the whole experiment:

```text
parent Model
  document        the authoritative Document
  editor          state the child cannot own: selection, nextId, history,
                  storedMarks, and hostId (the element the view renders)

editor Bundle reads  →  { document, selection, nextId, history, storedMarks, hostId }
editor Bundle writes →  the editor fields                (the document is not its own)
editor Bundle renders →  the host element, with the editor's events as its mount
editor Bundle emits  →  Edited { state } | Replaced { state } | Rejected { error }
                          + a RichText.patch Command
parent onOut         →  document = state.document, selection = state.selection
```

The Link's `read` projects the parent's document into the child on every
transition, so the child never stores a copy, and `write` deliberately drops the
document field. `onOut` runs with the child already written back, in the same
parent transition, which is what makes the two halves commit together.

Rendering is the one thing that is not part of that transition: the Bundle's
`update` returns a `RichText.patch` Command carrying the `ChangeSet`, and the
Command syncs the attachment its host element holds (§118). The commit is
synchronous; the patch is what follows it.

`test/controlled.test.ts` asserts what that step commits: typing and mark
toggles land document and selection in one transition; a split mints block and
run identities from the parent-owned counter; a refused command changes nothing
and does not burn identities; and a document replaced from outside is what the
next command resolves against. `test/editorView.test.ts` asserts the other half:
the view renders the host the Command finds, pasting and the undo/redo chords
travel through Messages into the document and back out to the DOM, and running
that Command is what moves it.

## The DOM half (first increment)

The interpreter moved to `packages/richtext-dom` when Phase 4 promotion began, and
its README is the reference. It renders a Document into an owned `contenteditable`
root (one element per block, one `span[data-run]` per run, marks as `data-marks`,
preserved unknown blocks as read-only placeholders), maps positions both ways
(`positionToRange` / `rangeToPosition`), and patches a ChangeSet in place: removed
identities lose their elements, dirty identities are re-rendered or inserted, and
every untouched element keeps its object identity so a keystroke does not rebuild
the tree.

`packages/richtext-dom/test/dom.test.ts` runs under jsdom and covers rendering,
both-way position mapping (including what a DOM caret cannot recover: affinity is
derived, not round-tripped), in-place patching, retired identities after
normalization, and one end-to-end editing loop: DOM selection → `RichText.run` →
patch → restored selection.

## The DOM half (second increment)

`packages/richtext-dom/src/events.ts` wires the same subtree to an application.
`intentFor(event)` reads
`beforeinput` and `keydown` as a semantic command; every event the adapter
understands is `preventDefault`ed so the browser cannot mutate the DOM behind
the document, and one it understands but cannot honor yet (paste, word
deletion, autocorrect) is prevented with no command rather than allowed to
drift. `attach(dom, { onIntent })` listens, tracks composition, and `sync`s a
committed `EditorState` back into the DOM and the browser selection.

Composition is the sharp case: while an IME is composing, input passes through
and no command is emitted; `compositionend` becomes one `InsertText` at the
semantic caret, and the following patch corrects whatever temporary text the
browser had put in the DOM.

Undo and redo are editor intents rather than commands, so `intentFor` reports
them separately (`{ history: 'undo' | 'redo' }` on the `Mod-z`, `Mod-Shift-z`,
and `Mod-y` chords) and `attach` routes them through `onHistory`. The harness
commits history in the child and replaces the document on undo, reporting a
whole-document ChangeSet so the patch cannot leave stale elements behind.

Clipboard events are wired too. `copy` and `cut` write three payloads — the
slice under `application/x-foldkit-richtext+json`, its HTML, and its plain text
— and `cut` additionally emits the same delete intent a Backspace would (a
collapsed caret cuts nothing). `paste` resolves in the documented priority:
slice, then HTML, then plain text.

## The editor's Messages

`src/editor.ts` is where the browser meets the editor's vocabulary (§118). The
adapter reports what happened as commands, a caret, and a history chord; this
turns each one into the Message an editor's `update` already handles:

```ts
const Message = defineMessageUnion({
  Typed, Backspace, DeletedForward, Entered, ToggledMark,
  Selected, Pasted, Undone, Redone,
})
```

`toMessage(command)` is that translation, and it refuses what the vocabulary
cannot carry rather than dropping a detail: the adapter reports only plain
insertions and toggles by name, so an insertion carrying marks and a mark value
with props come back `undefined` — the vocabulary has no shape for them yet, and
silently losing the marks would be worse. `attachEditor(host, content, emit)`
attaches the translation to a host element and reports each Message;
`events({ content })` wraps the same thing in a `Mount.defineStream`, so a view can
render a host element whose mount produces these Messages and releases the subtree
when the element goes. `patchEditor(hostId, state, changeSet)` is what the patch
Command runs: it finds the element by id, syncs the attachment it holds, and
reports whether it patched — a missing host is an editor that went away while the
transition was in flight, not an error.

The proof's union moved here: `controlled.ts` imports it instead of declaring a
second one, which also gave the proof paste.

## Read-only view

`src/view.ts` renders a document (or a slice) as ordinary Foldkit `Html` using
`inertHtml`, so it dispatches nothing and owns no DOM:

```ts
const html = renderDocument(document)   // a div of block elements
renderBlocks(slice.blocks)              // one element per block
```

Blocks become `p`/`h1`–`h6`, marks nest as `strong`/`em`/`code` in the same
order the HTML serializer uses, unknown marks ride on a `span` with
`data-marks`, and unknown blocks render as an inert `div data-unknown="Type"`
placeholder. One caveat worth knowing: `h.DataAttribute` prefixes `data-` itself,
so it takes the bare name (`DataAttribute('unknown', …)` → `data-unknown`).

## HTML import

`packages/richtext-dom/src/html.ts` parses pasted HTML with a whitelist rather
than trusting it.
Known block tags become blocks, known inline tags become marks (`strong`/`b` →
Bold, `em`/`i` → Italic, `code` → Code), our own `data-marks` and
`data-unknown` attributes round-trip, and every other element is either
unwrapped or dropped with a diagnostic. No attribute is ever interpreted, so a
pasted `style`, `href`, or `onclick` cannot survive as anything executable, and
`script`/`style`/`iframe` and friends are dropped *with their content*. With a
`kit` passed to `attach`, a node kind the Kit does not declare is degraded to a
paragraph instead of kept.

Import lives in `foldkit-richtext-dom` because it needs a `DOMParser`;
`foldkit-richtext` stays DOM-free and owns only the string serializer.

`repair(dom, content)` is recovery, not domain state (§31): it re-renders only
blocks whose rendered text drifted, drops elements the document does not know,
and returns the same `EditorDom` when nothing was wrong. `compositionend` uses
it — whether the IME committed or cancelled, the browser's temporary text is not
in the document — and because a repair detaches the live selection, the adapter
captures the semantic selection first and restores it after.

`packages/richtext-dom/test/events.test.ts` covers the translation table, the
deliberate no-ops, the
IME handover and cancellation, the history chords, and the wired loop (type,
Enter, Backspace, composition commit, detach). `test/controlled.test.ts` covers
undo end to end: a typing burst collapses to one step, a discrete command undoes
alone, an empty history is refused, and redo restores what undo took away.
`packages/richtext-dom/test/dom.test.ts` covers repair directly.

Four bugs the loop tests caught, all now recorded in the design doc: inserted
nodes must be inserted (replacement alone leaves them out), an empty run still
needs a text node for the caret to be addressable, a removed identity that is
also dirty must still lose its element, and repairing detaches the live
selection unless it is captured and restored.

Not built yet: mobile virtual keyboards. The adapter is still private and
throwaway-tolerant.

## Running it

```bash
pnpm vitest run examples/richtext/test
pnpm exec tsc -b examples/richtext
```

## Running it in a browser

`harness.html` mounts the adapter over a list and prints the semantic state after
every command, so the slice can be exercised where jsdom cannot reach: real
typing, a real `beforeinput`, a real selection, a real Enter. It is served from
source, so it needs no build and no `pnpm install`:

```bash
pnpm exec vite examples/richtext --port 5179
# then open http://127.0.0.1:5179/harness.html
```

The page exposes `window.harness` (`state()`, `selection()`, `caret(node, offset)`)
for a browser-driving tool. It has been verified to **build and serve** — Vite
resolves `foldkit-richtext` and `foldkit-richtext-dom` to their sources and
transpiles every module — but not yet to be **driven** by a real browser: the
browser tool in this session needs a desktop-app connection it does not have, so
the transient behaviour the slice actually cares about (IME composition, native
selection, clipboard permissions) stays unverified. That is the deferred item in
§115, not a claim.

## Why there is no package.json

The harness only needs `foldkit-richtext`, `foldkit-richtext-dom`, and
`foldkit-bundle`, all mapped to source in `tsconfig.json` and aliased in the root
`vitest.config.ts`. Keeping the harness out of the workspace dependency graph
means it needs no `pnpm install`, so it adds no lockfile churn. Promote it to a
runnable example (add a `package.json` with `workspace:*` dependencies and run
`pnpm install`) only when it grows a demo entry point.

## Results

Recorded in the design doc (§27): controlled ownership works without a second
synchronized document copy or a delayed Command. The DOM half now lives in
`packages/richtext-dom`: rendering, both-way position mapping, in-place patching,
event translation, and HTML import, exercised by its tests. What it does not prove
yet is the browser's transient state — IME composition, autocorrect, undo, and
mobile keyboards — which is the rest of the Phase 3 slice.
