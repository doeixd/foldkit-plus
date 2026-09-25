# foldkit-richtext-markdown

Print a [`foldkit-richtext`](../richtext) document as Markdown.

Markdown is an interpreter over the semantic document, not a second document model. This
package maps a document to CommonMark — with GFM's lists, tasks, strikethrough, and tables
— and reports what the mapping cannot express instead of dropping it silently.

**Printing only, for now.** Parsing needs a parser stack (`micromark`/`mdast`), which is
the next slice. Printing needs none, and it is what serves Markdown export and the source
mode in the design's roadmap. Both directions will share one profile once parsing lands.

## Install

```bash
pnpm add foldkit-richtext-markdown
```

## What it owns

The Markdown *syntax*, and nothing else. The document stays `foldkit-richtext`'s, the
editable subtree stays `foldkit-richtext-dom`'s, and no state lives here: `print` is a pure
function of a `Document`.

## Print a document

```ts
import * as RichText from 'foldkit-richtext'
import { print } from 'foldkit-richtext-markdown'

const { markdown, diagnostics } = print(document)

markdown // '> quoted\n\n- one\n- two\n'
diagnostics // [{ code: 'UnsupportedNode', detail: 'Callout', node: 'c' }]
```

`diagnostics` names every kind or mark the mapping has no syntax for. A block kind with no
syntax prints its content rather than losing it; a preserved `Unknown` block is reported and
skipped, because its payload is opaque.

| Document | Markdown |
| --- | --- |
| `Paragraph`, `Heading` | the text, and `#`…`######` |
| `Quote` | `>` on every line, a blank one included |
| `List`, `ListItem`, `TaskItem` | `-` / `1.` and `- [x]`; a nested block stays aligned under its marker |
| `CodeBlock` | a fence, its `language`, the text verbatim, and a fence longer than any backticks inside |
| `ThematicBreak` | `---` |
| `Image` | `![alt](src)` on its own line |
| `Table`, `TableRow`, `TableCell` | a GFM pipe table, first row as the header |
| `Bold`, `Italic`, `Code`, `Strikethrough`, `Link` | `**`, `*`, backticks, `~~`, `[label](href)`, with the link outermost |

Text is escaped so it cannot become markup: a backslash before an inline delimiter, and
before a block marker — or a `1.` — that would open a paragraph's line. A leading space
becomes `&#32;`.

## Limits

- **A table's header.** The model does not say which row is one, so the first row is
  printed as the header. A cell's blocks are inlined with a space between them.
- **Inline atoms.** The model has no inline image or break, so an `Image` is a block and
  prints as its own line — which a parser reads back as a paragraph holding an image.
- **A link with no `href`** prints as its label, with an `UnsupportedMark` diagnostic.
- **Not a round trip yet.** The output is verified against expected Markdown;
  `parse(print(document))` becomes testable when parsing lands.
