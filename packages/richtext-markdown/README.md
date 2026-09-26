# foldkit-richtext-markdown

Read and write Markdown for a [`foldkit-richtext`](../richtext) document.

Markdown is an interpreter over the semantic document, not a second document model. This
package maps a document to CommonMark — with GFM's lists, tasks, strikethrough, and tables
— reads the same set back, and reports what a mapping cannot express instead of dropping it
silently.

Printing needs nothing beyond this package. Parsing uses `micromark` and `mdast`, the
parser stack the design asks for. Both directions return diagnostics, so a caller can
refuse, warn, or show a placeholder rather than lose content.

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

markdown // 'hello\n'
diagnostics // []
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
| `Table`, `TableRow`, `TableCell` | a GFM pipe table, the first row as its header (`TableRow.header`) |
| `Bold`, `Italic`, `Code`, `Strikethrough`, `Link` | `**`, `*`, backticks, `~~`, `[label](href)`, with the link outermost |

Text is escaped so it cannot become markup: a backslash before an inline delimiter, and
before a block marker — or a `1.` — that would open a paragraph's line. A leading space
becomes `&#32;`.

## Parse Markdown

```ts
import { parse } from 'foldkit-richtext-markdown'

let n = 0
const { document, diagnostics } = parse('> quoted\n', { mint: () => `id-${++n}` })
```

`mint` supplies every identity, as it does everywhere else in the library, and the document
is decoded through the codec, so a bad construction fails loudly instead of reaching an
editor.

It reads CommonMark, plus GFM's task lists, strikethrough, and tables. It reports instead
of guessing: raw HTML, a link definition, a footnote, a hard line break (which becomes its
own paragraph, because a block holds no line break), and an image inside a paragraph
(`Image` is a block, so a paragraph holding only one is hoisted to it). Markdown is as
untrusted as pasted HTML, so a link's or an image's URL passes the same `safeUrl` policy
HTML import uses: a refused link keeps its text unlinked, a refused image is dropped, and
each is reported as `UnsafeUrl`.

`print(parse(markdown))` returns the same Markdown and `parse(print(document))` a document
that prints the same, which is how the two directions are tested against each other.

## Input rules

`markdownInputRules` reshapes a block when a marker is completed at its start: `# ` through
`###### ` retype it as a heading (`RetypeBlock`), and `> `, `- `/`* `/`+ `, and an ordered
marker such as `1. ` or `3) ` wrap it in a quote or a list (`WrapBlock`), an ordered list
numbered from the number typed; and a fence with an optional language, such as
`` ```ts `` then a space, converts it to a `CodeBlock` (`ConvertBlock`). An editor
placement in `foldkit-richtext-dom` names the rules it applies, so this package holds no
editor state and the editor holds no Markdown:

```ts
import { editorAt } from 'foldkit-richtext-dom/editor-bundle'
import { markdownInputRules } from 'foldkit-richtext-markdown'

const body = editorAt('article-body', { inputRules: markdownInputRules })
```

A fence is completed by a space, not by the line break Markdown reads it at, because Enter
splits a block and a rule sees only what is typed. Converting gives the block's runs new
identities, and a block carrying marks is refused under the standard vocabulary, whose
`CodeBlock` forbids them. A list marker typed right after a list starts a new list beside it
rather than adding an item to that one.

## Limits

- **A table's header.** GFM's header is the first row, so that row is printed as the header
  whether or not the document marks one; a row marked as the header anywhere else is
  reported, because GFM cannot place it. A cell's blocks are inlined with a space between
  them.
- **Inline atoms.** The model has no inline image or break, so an `Image` is a block and
  prints as its own line — which a parser reads back as a paragraph holding an image.
- **A link with no `href`** prints as its label, with an `UnsupportedMark` diagnostic.
- **A mark on whitespace at a run's edge.** `**bold **` is not emphasis in CommonMark, so a
  marked run's leading and trailing whitespace is printed outside its delimiters: the text
  survives, and the space reads back unmarked.
- **A bare URL in text.** GFM links `https://…`, `www.…`, and email addresses written as
  plain text, and no escape stops it, so such text reads back as a link.
- **A hard line break** has no shape inside a block, so it ends the paragraph and the rest
  starts a new one, with a diagnostic. Raw HTML, link definitions, and footnotes are
  reported and skipped: a document holds none of them.
- **No profile yet.** Custom syntax needs both directions at once, so it arrives with the
  first application that declares one.
