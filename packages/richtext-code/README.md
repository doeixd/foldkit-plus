# foldkit-richtext-code

Grammars that turn a [`foldkit-richtext`](../richtext) `CodeBlock`'s text into highlighting
tokens.

Highlighting is a **decoration**, not document content (§124 §7): the block holds the code and
its language, a tokenizer reads the text, and `codeDecorations` turns the tokens into ranges a
renderer draws and then discards. This package holds grammars; the contract and the producer
live in `foldkit-richtext`, because they are format-agnostic.

## Install

```bash
pnpm add foldkit-richtext-code
```

## What it owns

One grammar per language that can be written exactly. JSON is here. TypeScript and JavaScript
are not, because a lexer that is half right is worse than none — they wait for a highlighter
that is not hand-rolled (`foldkit-richtext-code-shiki`, §130). The package holds no state and
imports nothing at runtime beyond types.

## Highlight a code block

```ts
import * as RichText from 'foldkit-richtext'
import { jsonTokenizer } from 'foldkit-richtext-code'
import { renderDocument } from 'foldkit-richtext-dom/view'

const decorations = RichText.codeDecorations(document, [jsonTokenizer])
renderDocument(document, RichText.noRendering, decorations)
// each token is inside a span carrying data-decoration="syntax-string", "syntax-number", …
```

`codeDecorations` reads every `CodeBlock` whose `language` a tokenizer names, and a block with
no tokenizer is left unhighlighted rather than reported: an unknown language is not a mistake.
The token's own name rides in the decoration's data as well as in its kind, which is what a
registry over `data` would read (§129).

| Kind | What it covers |
| --- | --- |
| `string` | a quoted string, escapes included; an unterminated one runs to the end of the block |
| `number` | JSON's own shape, exponent included |
| `boolean`, `null` | the three literals |
| `punctuation` | `{`, `}`, `[`, `]`, `:`, `,` |
| `invalid` | a character that begins no token |

## Limits

- Whitespace is skipped rather than tokenized.
- Only the languages listed here are highlighted. An application can pass its own tokenizer to
  `codeDecorations` without this package; `CodeTokenizer` is the contract.
- Nothing here reads the DOM or the Model: a tokenizer is text to ranges, and where the result
  is drawn is the interpreter's business.
