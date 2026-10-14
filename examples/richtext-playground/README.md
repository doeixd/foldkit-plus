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

An image is read from a file into a `data:` URL ([canvas.ts](src/canvas.ts)), from the file
field, a paste or a drop, and shown at its own width up to 640 pixels. The standard URL policy
refuses `data:` for links, so the rendering accepts it only as an image's source.

## Tests

`pnpm test` runs [test/app.test.ts](test/app.test.ts), which drives `update` as the page does;
`pnpm e2e` runs [e2e/playground.e2e.ts](e2e/playground.e2e.ts) in Chromium, for what only a
browser shows: a click on an adornment, a slash command, a file read, the floating toolbar and
the handle.
