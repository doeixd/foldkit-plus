# foldkit-richtext-code

Grammars for highlighting a [`foldkit-richtext`](../richtext) `CodeBlock`.

A code block's document holds its `language` and its plain text, never tokens. What a
highlighter finds in that text is presentation: a set of decorations, derived for a render
and discarded, like a search match. `foldkit-richtext` owns the contract (`CodeTokenizer`)
and the producer (`codeDecorations`); this package owns grammars — a tokenizer is a pure
function from a block's text to token ranges.

```text
CodeBlock { language, text } ── tokenizer ──> tokens ── codeDecorations ──> DecorationSet ──> renderer
```

## Install

```bash
pnpm add foldkit-richtext-code
```

## What it owns

Grammars, and nothing else: no state, no document change, no loading. The document is
`foldkit-richtext`'s, drawing the result is the renderer's (`foldkit-richtext-dom`'s read-only
view draws a decoration as `span[data-decoration=<kind>]`), and a grammar that must load
before it can run — Shiki — is a separate adapter's, because it needs a Command rather than a
pure call.

## Highlight JSON

```ts
import * as RichText from 'foldkit-richtext'
import { jsonTokenizer } from 'foldkit-richtext-code'

const document = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Node',
      kind: 'CodeBlock',
      id: 'c',
      props: { language: 'json' },
      children: [{ type: 'Text', id: 't', text: '{"a": 1}', marks: [] }],
    },
  ],
})

const tokens = RichText.codeDecorations(document, new Map([['json', jsonTokenizer]]))
```

`codeDecorations` reads the document; it changes nothing and loads nothing. The `Map` says
which tokenizer serves which `language` prop, so registering `jsonTokenizer` under `jsonc`
as well is one more entry. Pass `tokens` to a renderer beside the document, and compute them
again when the document changes.

The kinds are `syntax-property` (an object key), `syntax-string`, `syntax-number`,
`syntax-keyword` (`true`, `false`, `null`), and `syntax-punctuation`, which a stylesheet
reaches as `[data-decoration="syntax-number"]` and so on.

## In the editor

`foldkit-richtext-dom`'s editor draws decorations its placement derives from the document:

```ts
import * as RichText from 'foldkit-richtext'
import { editorAt } from 'foldkit-richtext-dom/editor-bundle'
import { jsonTokenizer } from 'foldkit-richtext-code'

const tokenizers = new Map([['json', jsonTokenizer]])

const body = editorAt('article-body', {
  decorate: document => RichText.codeDecorations(document, tokenizers),
})
```

The editor calls `decorate` at its mount and on every patch, and draws the result as the
read-only view does, so one stylesheet serves both.

## Invalid text

A code block being typed is rarely valid JSON, so the tokenizer is total: it never throws,
every token lies inside the text in order, a string still being typed ends at the line break
or the end of the text, and a character JSON has no token for gets none. What it can read is
highlighted and the rest stays plain. It is a lexer, not a validator: it does not check that
the tokens form a JSON value.

## Limits

- **JSON only.** TypeScript, JavaScript, and the rest wait for the Shiki adapter rather than
  a hand-written lexer that would be half right.
- **Highlighting runs on every patch.** An editor placed with a `decorate` (below)
  retokenizes every code block each time it patches. That is cheap for JSON; caching by block
  is the Shiki adapter's job.
