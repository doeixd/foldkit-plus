# foldkit-richtext-code-shiki

Built-in lexers cover simple formats like JSON, while languages such as TypeScript, CSS, or Python need full TextMate grammars. Rather than storing theme-specific colors inside your documents, you can keep plain text in the document and highlight it at render time using a synchronous [Shiki](https://shiki.style) highlighter.

`foldkit-richtext-code-shiki` adapts any synchronous Shiki highlighter you configure at startup into tokenizers for [`foldkit-richtext`](../richtext) code blocks. It maps Shiki's TextMate scopes onto the same `syntax-*` decoration kinds used by [`foldkit-richtext-code`](../richtext-code), so one stylesheet paints every language. See it running in [the rich-text playground](https://foldkit-richtext-demo.pages.dev/).

## Install

```bash
pnpm add foldkit-richtext-code-shiki shiki
```

## A first highlighter: TypeScript

Create a synchronous Shiki highlighter with the languages you want to support and convert it into a language-to-tokenizer map:

```ts
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
```

`shikiTokenizers(highlighter)` returns a `Map` with an entry for every loaded language and alias (`typescript`, `ts`, `cts`, `mts`). Pass that map to `RichText.codeDecorations` when rendering a read-only view or placing an editor:

```ts
import * as RichText from 'foldkit-richtext'

const decorate = (document: RichText.Document) => RichText.codeDecorations(document, tokenizers)
```

Your application owns the highlighter—which grammars and themes it loads, and when. Because a tokenizer runs synchronously during render, build the highlighter at startup with `createHighlighterCoreSync` and Shiki's JavaScript regex engine before placing the editor. If you call `shikiTokenizer(highlighter, language)` for a single language, it throws right away if that language or any theme is missing (Shiki requires a theme to tokenize even though its inline colors are discarded).

## How Shiki scopes map to decorations

Shiki's inline colors are ignored. Instead, each token's TextMate scopes are matched by whole segments (so `string` and `string.quoted` match, never `stringy`) against nine `syntax-*` kinds, with the first match winning:

| Kind | Typical scopes |
| --- | --- |
| `syntax-comment` | Comments and doc blocks |
| `syntax-property` | Object keys and property names |
| `syntax-string` | Quoted strings and string delimiters |
| `syntax-number` | Numeric literals |
| `syntax-keyword` | Language keywords and modifiers |
| `syntax-operator` | Arithmetic, logical, and assignment operators |
| `syntax-function` | Function and method names |
| `syntax-type` | Type annotations and class names |
| `syntax-punctuation` | Brackets, braces, and separators |

Whitespace and plain identifiers receive no decoration. Style each kind in CSS with `[data-decoration="syntax-keyword"]` and its siblings.

## Caching and performance

Each tokenizer caches the last 64 block strings it tokenized, so an editor that runs `decorate` on every patch only re-parses the code block whose text changed. Reading TextMate scopes (`includeExplanation`) is Shiki's slower path, so a very large code block still pays a full parse per edit. The adapter disables Shiki's per-line timeout so a complex line takes longer rather than throwing during render.

## Limits

- **No asynchronous grammar loading.** Grammars loaded after you build `tokenizers` are not picked up automatically; rebuild `tokenizers` and update the placement when new grammars finish loading.
- **Fixed decoration kinds.** Scopes outside the nine `syntax-*` kinds above receive no decoration.

## Next

- Lightweight JSON highlighting with zero grammar setup: [`foldkit-richtext-code`](../richtext-code)
- Mount an editor and pass `decorate`: [`foldkit-richtext-dom`](../richtext-dom)
- Add a language selector and copy button: [`foldkit-mixins-richtext`](../mixins-richtext#the-table-and-code-toolbars)
