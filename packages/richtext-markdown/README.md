# foldkit-richtext-markdown

Converting rich-text documents to and from Markdown often forces a choice between lossy converters that silently drop unsupported blocks and raw Markdown storage that breaks node identities during edits. You want lossless round-trips for standard formatting and explicit warnings whenever a block or mark has no Markdown syntax.

`foldkit-richtext-markdown` prints [`foldkit-richtext`](../richtext) documents to CommonMark (with GFM lists, task items, strikethrough, tables, and optional footnotes), parses Markdown back into validated documents using `micromark` and `mdast`, and supplies typing shortcuts and source-mode helpers. See Markdown shortcuts and source editing live in [the rich-text playground](https://foldkit-richtext-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-richtext-markdown
```

## A first round trip

Print a `foldkit-richtext` document to Markdown and inspect any conversion diagnostics:

```ts
import * as RichText from 'foldkit-richtext'
import { print } from 'foldkit-richtext-markdown'

const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'hello', marks: [] }],
    },
  ],
})

const { markdown, diagnostics } = print(document)
// markdown === 'hello\n', diagnostics === []
```

`print` is a pure function of a `Document`. When a block kind has no Markdown syntax, `print` outputs its inner content and records an entry in `diagnostics` so your application can warn or block export. Preserved `Unknown` blocks are skipped and reported because their payload is opaque. Your application keeps the `Document` in its Model and uses `foldkit-richtext-dom` for the editable DOM subtree.

## Print a document

Each standard node kind and mark maps to a canonical Markdown spelling:

| Document construct | Markdown output |
| --- | --- |
| `Paragraph`, `Heading` | Text lines and `#` through `######` prefixes |
| `Quote` | `>` prefix on every line, including blank lines |
| `List`, `ListItem`, `TaskItem` | `-`, `1.`, and `- [x]` markers with nested alignment |
| `CodeBlock` | Backtick fence longer than inner backticks, with `language` |
| `ThematicBreak` | `---` |
| `Image` | `![alt](src)` on its own line |
| `FootnoteRef` on a run | `[^label]` in place of the label the run displays |
| `FootnoteDefinition` | `[^label]: ` with subsequent lines indented four spaces |
| `Table`, `TableRow`, `TableCell` | GFM pipe table using the first row as the header |
| `Bold`, `Italic`, `Code`, `Strikethrough`, `Link` | `**`, `*`, `` ` ``, `~~`, and `[label](href)` |

Adjacent lists of the same kind alternate markers (`-` then `*`, `.` then `)`) so they parse back as separate lists.

Text is escaped to prevent unintended markup: backslashes precede inline delimiters, `!`, `|`, and paragraph-opening block markers (`-`, `>`, `1.`). A leading space becomes `&#32;`. When CommonMark rules block emphasis because punctuation borders a letter (`x**(a)**y`), the bordering letter is written as a numeric character reference (`&#120;**(a)**&#121;`), which parses back as the same letter. An empty task item prints as `- [ ]`, and `parse` restores an item holding only `[ ]` or `[x]` as an empty task.

## Parse Markdown

Parse Markdown into a validated document by providing an ID generator (`mint`):

```ts
import { parse } from 'foldkit-richtext-markdown'

let n = 0
const { document: parsedDoc, diagnostics: parseDiagnostics } = parse('> quoted\n', {
  mint: () => `id-${++n}`,
})
```

`mint` supplies every node and run ID, and the result runs through the document codec so invalid structure fails immediately.

`parse` reads CommonMark plus GFM task lists, strikethrough, and tables. Pass `footnotes: true` to decode footnotes into `FootnoteRef` and `FootnoteDefinition` nodes; otherwise footnotes are skipped and reported. Rather than guessing, `parse` reports raw HTML, link reference definitions (keeping reference text unlinked), hard line breaks (split into separate paragraphs), and images inside paragraphs (hoisted when alone). Every link `href` and image `src` passes the same `safeUrl` check used by HTML import; unsafe URLs keep link text unlinked, drop images, and report `UnsafeUrl`.

Canonical printing and parsing round-trip cleanly: `print(parse(markdown))` reproduces the canonical Markdown (`*` emphasis, `-` bullets, backtick fences, `#` headings), and `parse(print(document))` reproduces an equivalent document.

To preserve a writer's original formatting choices (such as `_hello_`, `* item`, or `===` underlined headings), pass the `style` object returned by `parse` back into `print`:

```ts
const parsed = parse('_hello_\n\n* item\n', { mint: () => `id-${++n}` })
print(parsed.document, { style: parsed.style }).markdown // '_hello_\n\n* item\n'
```

`style.blocks` records how each parsed list, heading, fence, and thematic break was written, including loose vs. tight list spacing (defaulting to tight without a style). Blocks added later in the rich editor fall back to the construct's default spelling. If applying a saved style would change the parsed meaning (for example, `_` inside a word), `print` falls back to canonical syntax.

## Type Markdown shortcuts with input rules

`markdownInputRules` converts completed Markdown markers into rich-text blocks and marks as the user types:

- **Block prefixes:** `# ` through `###### ` retype the block as a heading; `> `, `- `, `* `, `+ `, and `1. ` / `3) ` wrap the block in a quote or list; `` ```ts `` followed by a space converts to a `CodeBlock`; `[ ] ` or `[x] ` at the start of a list item's first block converts it to a `TaskItem`.
- **Inline delimiters:** `**bold**`, `*italic*`, `_italic_`, `` `code` ``, and `~~struck~~` apply the mark when the closing delimiter is typed, leaving subsequent text unmarked. Opening markers require the start of a block, whitespace, an opening bracket, or a quote, so `snake_case_name` and `2*3*4` stay plain text.

Pass the rules to an editor placement in [`foldkit-richtext-dom`](../richtext-dom):

```ts
import { editorAt } from 'foldkit-richtext-dom/editor-bundle'
import { markdownInputRules } from 'foldkit-richtext-markdown'

const body = editorAt('article-body', { inputRules: markdownInputRules })
```

Fences trigger on a space rather than Enter because Enter splits blocks before the rule runs. Under the standard vocabulary, `CodeBlock` forbids marks, so a fence typed on a block with marks is refused and kept as plain text. A list marker typed immediately after an existing list starts a separate list beside it.

## Edit the Markdown itself

A `SourceSession` lets a user switch to editing raw Markdown and switch back without losing unedited IDs or unsupported marks. Keep the session value in your application Model while source mode is active:

```ts
import { closeSource, openSource } from 'foldkit-richtext-markdown'

// Enter source mode: draft starts as the printed document.
const session = openSource(parsed.document)

// Replace draft on each keystroke in the source textarea.
const edited = { ...session, draft: '# Title\n\nNew text\n' }

// Leave source mode (pure read, also usable as a live preview).
const closed = closeSource(edited, parsed.document, { mint: () => crypto.randomUUID() })
```

`openSource` prints the document and preserves any marks Markdown lacks syntax for in `unprintable`. If the user exits without editing (`closed.changed === false`), `closeSource` returns the original `Document` untouched with its IDs and unprintable marks intact. When edited, `closeSource` parses the draft and returns `diagnostics` listing lost unprintable content followed by any parse warnings, letting your application warn before committing `closed.document`.

Pass `closed.style` back into the next `openSource(document, { style })` so writers keep their preferred emphasis and bullet syntax across mode switches. Passing `{ selection }` to `openSource` also maps the rich caret offset into `session.caret`, and updating `caret` in the textarea lets `closeSource` compute `closed.selection` back in the rich document (`null` when the draft is empty or block counts changed while unedited).

## Limits

- **Minor round-trip losses:** Trailing blank lines in code blocks, leading heading spaces, info-string words after a fence language (```` ```ts title ````), line breaks inside setext headings, and row cell count padding are adjusted without emitting diagnostics.
- **Table headers:** GFM requires the first row to be the header, so `print` always writes the first row as the header and reports header flags on later rows. Cell blocks join on one line separated by spaces.
- **Block-only images:** `Image` is a block node, so it prints on its own line; `parse` hoists a paragraph containing only an image into an `Image` block.
- **Links without `href`:** Print as plain label text with an `UnsupportedMark` diagnostic.
- **URL handling:** `print` escapes punctuation backslashes, `&` references, angle-brackets spaces, and percent-encodes control characters; `parse` strips controls, trims whitespace, drops link titles, and rejects unsafe schemes (`UnsafeUrl`).
- **Marks on edge whitespace:** Because `**bold **` is invalid in CommonMark, leading and trailing spaces move outside the delimiters and parse back unmarked.
- **Bare URLs:** GFM autolinks bare `https://`, `www.`, and email text on parse.
- **Hard breaks, raw HTML, and link definitions:** Hard line breaks split into new paragraphs with a diagnostic; raw HTML and link definitions are skipped and reported. Footnotes skip unless `footnotes: true` is passed, and labels with spaces print as plain text with a diagnostic.
- **Custom syntax:** User-defined block or mark Markdown syntax requires a shared profile across both directions and is left for a future release.

## Next

- Mount a browser editor with `markdownInputRules`: [`foldkit-richtext-dom`](../richtext-dom)
- Add a source-mode editor and live preview UI: [`foldkit-mixins-richtext`](../mixins-richtext#the-markdown-source-editor)
- Understand document nodes, marks, and Kits: [`foldkit-richtext`](../richtext)
