# foldkit-richtext-code-shiki

[Shiki](https://shiki.style)'s grammars as tokenizers for a
[`foldkit-richtext`](../richtext) `CodeBlock`.

A code block's document holds its `language` and plain text; what a highlighter finds there is
a set of decorations, derived for a render and discarded (`RichText.codeDecorations`). This
package turns a Shiki highlighter the application already made into those tokenizers — one per
language it loaded — so TypeScript, CSS, Python, or anything else Shiki has a grammar for
highlights the way `foldkit-richtext-code`'s JSON grammar does.

## What it owns

The mapping from Shiki to the tokenizer contract, and nothing else. The application owns the
highlighter: which grammars and theme it loads, and when. The document stays
`foldkit-richtext`'s, and drawing stays the renderer's (`span[data-decoration=<kind>]`).

Shiki's colours are not used. Its TextMate scopes are read into the same `syntax-*` kinds the
JSON grammar names, so one stylesheet colours every language:

```text
syntax-comment  syntax-property  syntax-string  syntax-number  syntax-keyword
syntax-operator syntax-function  syntax-type    syntax-punctuation
```

A scope matches by whole segments (`string` and `string.quoted`, never `stringy`), and the
first kind that matches wins: a JSON key sits inside `string` and is a property, and a string's
quotes are part of the string. Whitespace and plain identifiers are not decorated.

## Install

```bash
pnpm add foldkit-richtext-code-shiki shiki
```

## Highlight TypeScript

```ts
import * as RichText from 'foldkit-richtext'
import { shikiTokenizers } from 'foldkit-richtext-code-shiki'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import typescript from 'shiki/langs/typescript.mjs'
import nord from 'shiki/themes/nord.mjs'

const highlighter = createHighlighterCoreSync({
  themes: [nord],
  langs: [typescript],
  engine: createJavaScriptRegexEngine(),
})

const tokenizers = shikiTokenizers(highlighter)

const decorate = (document: RichText.Document) => RichText.codeDecorations(document, tokenizers)
```

`shikiTokenizers` gives a `Map` from every name the highlighter loaded (`typescript`, `ts`,
`cts`, `mts`) to its tokenizer, which is what `codeDecorations` takes. `decorate` is what an
editor placement names, `editorAt(hostId, { decorate })` in `foldkit-richtext-dom`, and what a
read-only render passes to `renderDocument`.

The highlighter must be synchronous, which is why the example builds it with
`createHighlighterCoreSync` and Shiki's JavaScript regex engine: a tokenizer is called on
every render. Loading grammars is startup work that belongs to the application, before it
places an editor. `shikiTokenizer(highlighter, language)` makes one tokenizer, and it throws
when it is made if the highlighter has not loaded that language or any theme. Shiki needs a
theme to tokenize at all, even though its colours are discarded.

## Cost

Each tokenizer remembers the last 64 texts it read, so an editor that retokenizes every code
block on every patch pays for a block only when its text changes. Reading scopes
(`includeExplanation`) is Shiki's slow path, so a very large block still costs a full parse on
each edit to it.

## Limits

- **No asynchronous loading.** A grammar loaded after an editor is placed is not picked up;
  build the tokenizers again and place them again.
- **The kinds are fixed.** A scope outside the table above is not decorated, and there is no
  hook to map it; say what it should be and the table grows.
