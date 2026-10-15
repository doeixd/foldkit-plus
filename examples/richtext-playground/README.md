# Rich text playground

One document with everything `foldkit-richtext` can hold, to try in a browser: movable
blocks with a handle, discussions anchored to text, images, tables, toggles, callouts,
checklists, highlighted code and footnotes. Nothing leaves the page, and Reset starts over.

**Try it:** it is published at
[foldkit-richtext-demo.pages.dev](https://foldkit-richtext-demo.pages.dev/), as static files.
Locally:

```bash
pnpm --filter foldkit-example-richtext-playground dev
```

## Who owns what

```text
the Model owns the document        (Model.document, written back by update on every edit)
the editor owns the caret's state  (Model.editor: selection, history, slash menu index)
the application owns the rest      (who said what in each discussion, the open menu, the hovered block)
```

The editor's Bundle draws its host element and nothing else. Every edit arrives as one of the
editor's Messages (`GotEditor`), `update` hands it to `Editor.update`, and the document the
editor commits is written back in the same transition ([app.ts](src/app.ts), `edit`). Every
control around it (the toolbars, the handle's menu, the slash menu at the caret, the toolbar
over selected text) sends those same Messages, or the application's own.

## A discussion is two halves

The document holds which text a discussion is about, as a `Comment` mark carrying the thread's
id; the Model holds what was said. The mark moves with the text through every edit, split and
paste, and a discussion is open exactly while some text carries it. So resolving is taking the
mark off (`ClearedMark` with the mark's value, which leaves a discussion started inside it
alone), and undoing that brings the discussion back. Which discussion is open is not stored
either: it is the one the caret is in (`threadAt`).

## The vocabulary

[vocabulary.ts](src/vocabulary.ts) is the Kit and its rendering, all data:

- the standard kinds and marks, plus `Callout`, `Toggle` and `FootnoteDefinition`, and the
  `Underline`, `Highlight`, `Kbd`, `Comment` and `FootnoteRef` marks;
- the rendering, whose `adornments` draw what is not text: a task's checkbox, a toggle's
  arrow, an image's picture and caption, a code block's language. An adornment with `toggles`
  flips that prop when clicked, through the editor's `ChangedProps`, so a ticked task or an
  opened toggle is in the document, with undo;
- the slash catalogue, the editor's entries plus the blocks this application declares, which
  `editorAt`'s `slashEntries` makes Enter choose from;
- code highlighting through `foldkit-richtext-code-shiki`, as decorations: the colors are
  never in the document.

## Tables and code

While the caret is in a table, `foldkit-mixins-richtext`'s `tableToolbar` is drawn above it
(`blockAnchor({ side: 'above' })`): rows above and below, columns left and right, delete either,
switch the header row, or delete the table, each one undo step from `foldkit-richtext`'s table
commands. Tab and Shift+Tab move from cell to cell, and Tab in the last cell adds a row. In a code
block, `codeToolbar` picks the language and copies the code (`copyText` from `foldkit-primitives`);
Tab and Shift+Tab indent and outdent, and Enter keeps the line's indentation. Anywhere else Tab
moves focus, as it does on any page.

A file is read into a `data:` URL ([canvas.ts](src/canvas.ts)), from the file field, a paste
or a drop, up to 8 MB. An image is shown at its own width up to 640 pixels; any other file becomes
what `RichText.mediaBlock` says its type is, a video, a sound or an attachment, drawn by
`RichText.mediaRendering`. The standard URL policy refuses `data:` for links, so the rendering
accepts it only as an image's source, and media accepts only its own kind's.

## Find and replace

Ctrl+F opens `findReplace` under the toolbar, on the selected text when there is some. The query,
the replacement, the match it is on and whether case counts are the Model's (`Model.find`); the
matches are `RichText.findMatches` of the document, and Replace sends the editor's own
`ReplacedText`, so a replacement is one undo step. The matches are drawn as decorations through
`overlay`, which names positions in the document shown, so after every transition that changes
the document or the bar, `update` draws them again (`followFind`) and brings the current one into
view. Going to a match selects it in the editor without taking the find field's focus.

## Contents and export

The sidebar's Contents is `tableOfContents` over the document's headings, the caret's section
marked; choosing one sends `JumpedTo`, which puts the caret at the heading's start and
gives the editor the focus there with `focus(hostId, selection)`. Export copies the whole document
(`exported` in [app.ts](src/app.ts)): Markdown through `foldkit-richtext-markdown`'s `print`, which
reports what it has no syntax for (a callout, an image's caption) so the status can say so; HTML
through `RichText.toHtml` with the page's rendering; JSON as the encoded `RichText.Document`,
which decodes back to the same document. What a copy did shows for three seconds at the foot of
the window and goes by itself (`ExpireStatus`), unless a newer status has taken its place.

## Footnotes

The kit opts into `foldkit-richtext`'s footnotes (`FootnoteRef`, `FootnoteDefinition`), and the
slash and insert menus offer Footnote, the editor's `InsertedFootnote`: a reference at the caret,
its note last, the caret in the note. With the caret at a reference, `footnotePreview` is drawn
beside it, showing the note, renaming it, and sending `JumpedTo` the note. The note's ↩ is an
adornment with an `action`; the editor reports it as `ActivatedAdornment`, and `update` puts the
caret after the first reference and gives the editor the focus there.

## Tests

`pnpm test` runs [test/app.test.ts](test/app.test.ts), which drives `update` as the page does;
`pnpm e2e` runs [e2e/playground.e2e.ts](e2e/playground.e2e.ts) in Chromium, for what only a
browser shows: a click on an adornment, a slash command, a file read, the floating toolbar and
the handle.
