# foldkit-richtext harness

A private harness, not a runnable example and not published. It is what is left of
the Phase 3 slice and the §27 Bundle proof once promotion moved the code into
`packages/richtext-dom`: a page that mounts the editable adapter in a real browser
(`harness.html`), and the notes below on what the slice proved.

The editor is `foldkit-richtext-dom/editor-bundle` (the Bundle, its Link, and the
placement) over `foldkit-richtext-dom/editor` (the vocabulary, `toMessage`, the
mount, and the patch work). That package's README is the reference. The shape they
implement is still §27's:

```text
parent Model
  document        the authoritative Document
  editor          state the child cannot own: selection, nextId, history,
                  storedMarks, menuIndex, and hostId (the element the view renders)

editor Bundle reads  →  { document, selection, nextId, history, storedMarks, menuIndex, hostId }
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

The package's `test/editor-bundle.test.ts` asserts what that step commits: typing
and mark toggles land document and selection in one transition; a split mints block
and run identities from the parent-owned counter; a refused command changes nothing
and does not burn identities; and a document replaced from outside is what the next
command resolves against. Its `test/editorView.test.ts` asserts the other half: the
view renders the host the Command finds, pasting and the undo/redo chords travel
through Messages into the document and back out to the DOM, and running that
Command is what moves it.

## The DOM half (first increment)

The interpreter moved to `packages/richtext-dom` when Phase 4 promotion began, and
its README is the reference. It renders a Document into an owned `contenteditable`
root (one element per block, one `span[data-run]` per run, marks as `data-marks`,
preserved unknown blocks as read-only placeholders), maps positions both ways
(`positionToRange` / `rangeToPosition`), and patches a ChangeSet in place: removed
identities lose their elements, dirty identities are re-rendered or inserted, and
every untouched element keeps its object identity so a keystroke does not rebuild
the tree. The page mounts through a `rendering(...)` registry (§121), so the
browser also exercises what jsdom cannot confirm: a declared mark nested inside its
run element as a real `<a href>`, and a declared node kind rendered as its element
with an entry-less kind beside it keeping the `div` fallback.

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

The vocabulary an editor's `update` handles, and the mount that produces it, live
in `foldkit-richtext-dom` (`foldkit-richtext-dom/editor`, §118); that package's
README is the reference. `controlled.ts` imports them from there, so the same
Messages arrive whether a person typed, pasted, or moved the caret.

## Read-only view

The read-only renderer lives in `foldkit-richtext-dom`
(`foldkit-richtext-dom/view`); that package's README is the reference. It renders a
document or a slice as ordinary Foldkit `Html`, so it dispatches nothing and owns
no DOM — the harness keeps no copy.

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
pnpm vitest run packages/richtext-dom/test
pnpm exec tsc -b examples/richtext
```

## Running it in a browser

`harness.html` mounts the adapter over a list, a quote, and a paragraph carrying a
Link, through a rendering registry, and prints the semantic state after every
command together with what that registry rendered, so the slice can be exercised
where jsdom cannot reach: real typing, a real `beforeinput`, a real selection, a
real Enter. It is served from source, so it needs no build and no `pnpm install`:

```bash
pnpm exec vite examples/richtext --port 5179
# then open http://127.0.0.1:5179/harness.html
```

The page exposes `window.harness` (`state()`, `selection()`, `caret(node, offset)`,
`rendered()`, `links()`) for a browser-driving tool. A driven session should see
`rendered() === ['div', 'blockquote', 'p']` and `links() === ['/x']` before touching
anything — the list keeps the fallback, the quote renders declared, and the mark
became a real anchor — and should still see them after typing inside the marked run
or the quote, because `patch` reuses the registry the mount recorded. It has been
verified to **build and serve** — Vite resolves `foldkit-richtext` and
`foldkit-richtext-dom` to their sources and transpiles every module — but not yet to
be **driven** by a real browser: the browser tool in this session needs a
desktop-app connection it does not have, so the transient behaviour the slice
actually cares about (IME composition, native selection, clipboard permissions)
stays unverified. That is the deferred item in §115, not a claim.

## Why there is no package.json

The harness only needs `foldkit-richtext` and `foldkit-richtext-dom`, mapped to
source in `tsconfig.json` and aliased in the root `vitest.config.ts`. Keeping the
harness out of the workspace dependency graph
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
