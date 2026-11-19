# foldkit-richtext-code

Storing syntax tokens inside a saved document mixes presentation with content, bloats storage, and breaks when a grammar changes. A cleaner split keeps only the language name and plain text in the document, then computes token highlights on render and discards them.

`foldkit-richtext-code` provides pure tokenizers—starting with JSON—that read a [`foldkit-richtext`](../richtext) code block's text and produce token ranges. Pass them to `RichText.codeDecorations` to turn those ranges into decorations that any renderer or editor paints with CSS. See code blocks highlighted live in [the rich-text playground](https://foldkit-richtext-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-richtext-code
```

## A first example: highlight JSON

Build a document with a JSON code block, then derive its syntax decorations using `jsonTokenizer`:

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

`codeDecorations` reads each `CodeBlock` in `document`, finds the matching language in the `Map`, and returns a `DecorationSet` (an array of ephemeral ranges) without changing the document. Registering `jsonTokenizer` under `jsonc` as well takes one extra entry in the `Map`.

The tokenizer emits five decoration kinds, which `foldkit-richtext-dom` renders as `<span data-decoration="...">`:

| Kind | Matches |
| --- | --- |
| `syntax-property` | Object keys |
| `syntax-string` | Quoted string values |
| `syntax-number` | Numeric literals |
| `syntax-keyword` | `true`, `false`, and `null` |
| `syntax-punctuation` | Braces, brackets, colons, and commas |

Style them in CSS with selectors such as `[data-decoration="syntax-number"]`.

## Highlight code inside the editor

Pass a `decorate` function when placing an editor with [`foldkit-richtext-dom`](../richtext-dom):

```ts
import * as RichText from 'foldkit-richtext'
import { editorAt } from 'foldkit-richtext-dom/editor-bundle'
import { jsonTokenizer } from 'foldkit-richtext-code'

const tokenizers = new Map([['json', jsonTokenizer]])

const body = editorAt('article-body', {
  decorate: document => RichText.codeDecorations(document, tokenizers),
})
```

The editor runs `decorate` when it mounts and on every patch, painting the same `data-decoration` spans as the read-only view so one stylesheet covers both.

## Handle incomplete JSON while typing

A code block being edited is often invalid JSON. `jsonTokenizer` is total and never throws: every token stays inside the text in order, an unclosed string ends at the line break or end of text, and unrecognized characters stay plain. It acts as a lexer rather than a validator, so valid-looking tokens highlight immediately while syntax errors wait for you to finish typing.

## Limits

- **JSON only.** Other languages such as TypeScript, CSS, and Python belong to [`foldkit-richtext-code-shiki`](../richtext-code-shiki), which maps Shiki grammars onto the same `syntax-*` decoration kinds.
- **Re-runs on every patch.** An editor with `decorate` retokenizes code blocks on each patch. That is fast for JSON; block-level caching lives in the Shiki adapter.

## Next

- Highlight TypeScript, Python, and other languages: [`foldkit-richtext-code-shiki`](../richtext-code-shiki)
- Mount the editor and style its decorations: [`foldkit-richtext-dom`](../richtext-dom)
- Add a language picker and copy toolbar: [`foldkit-mixins-richtext`](../mixins-richtext#the-table-and-code-toolbars)
