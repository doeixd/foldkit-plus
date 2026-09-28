/**
 * Shiki's grammars as code tokenizers (§130): the application creates a highlighter with the
 * languages it wants, and each becomes a `CodeTokenizer` whose tokens are decorations. Shiki's
 * colours are not used; its TextMate scopes are read into the `syntax-*` kinds the JSON grammar
 * already names, so one stylesheet colours every language, and a theme stays the stylesheet's.
 *
 * The highlighter must be synchronous — `createHighlighterCoreSync` with the JavaScript regex
 * engine — because a tokenizer is a pure call made on every render. Loading grammars is the
 * application's startup work, not the editor's.
 */
import type { CodeToken, CodeTokenizer } from 'foldkit-richtext'
import type { HighlighterCore } from 'shiki/core'

/**
 * Which kind a scope stack reads as, first match wins. The order is the point: a JSON key sits
 * inside `string` and carries `support.type.property-name`, so property must be tried before
 * string and before `support.type` makes it a type; a string's quote
 * (`punctuation.definition.string`, inside `string`) belongs to the string, not punctuation;
 * and `keyword.operator` is an operator before every other `keyword.*` is a keyword.
 */
const KINDS: ReadonlyArray<readonly [kind: string, prefixes: ReadonlyArray<string>]> = [
  ['syntax-comment', ['comment']],
  ['syntax-property', ['support.type.property-name', 'meta.object-literal.key']],
  ['syntax-string', ['string']],
  ['syntax-number', ['constant.numeric']],
  ['syntax-operator', ['keyword.operator']],
  ['syntax-keyword', ['keyword', 'storage', 'constant.language']],
  ['syntax-function', ['entity.name.function', 'support.function']],
  ['syntax-type', ['entity.name.type', 'entity.name.class', 'support.type', 'support.class']],
  ['syntax-punctuation', ['punctuation']],
]

/** The kind a scope stack reads as, or none: plain text and whitespace are not decorated. */
const kindForScopes = (scopes: ReadonlyArray<string>): string | undefined => {
  for (const [kind, prefixes] of KINDS) {
    // A prefix matches whole scope segments: `string` and `string.quoted`, never `stringy`.
    const matches = scopes.some(scope =>
      prefixes.some(prefix => `${scope}.`.startsWith(`${prefix}.`)),
    )
    if (matches) return kind
  }
  return undefined
}

/**
 * How many texts one tokenizer remembers, least recently read forgotten first. An editor
 * retokenizes every block on every patch, and typing in one block makes a new text each
 * keystroke, so a block that did not change stays remembered while it keeps being read.
 */
const CACHED_TEXTS = 64

/**
 * The tokenizer for one language the highlighter has loaded. It throws here, when it is made,
 * if the language or any theme is missing, rather than on the first render. Adjacent pieces of
 * the same kind become one token. Results are remembered by text, so an unchanged block is not
 * tokenized again.
 */
export const shikiTokenizer = (highlighter: HighlighterCore, language: string): CodeTokenizer => {
  if (!highlighter.getLoadedLanguages().includes(language)) {
    throw new Error(`shikiTokenizer: the highlighter has not loaded "${language}"`)
  }
  // Tokenizing needs a theme even though its colours are discarded.
  const [theme] = highlighter.getLoadedThemes()
  if (theme === undefined) throw new Error('shikiTokenizer: the highlighter has no theme loaded')
  const cache = new Map<string, ReadonlyArray<CodeToken>>()
  return text => {
    const cached = cache.get(text)
    if (cached !== undefined) {
      // A Map keeps insertion order, so re-inserting marks this text as the latest read.
      cache.delete(text)
      cache.set(text, cached)
      return cached
    }
    const tokens: Array<CodeToken> = []
    const { tokens: lines } = highlighter.codeToTokens(text, {
      lang: language,
      theme,
      includeExplanation: true,
      // Explanations tokenize each line twice, each pass under this limit; when one pass is
      // cut short and the other is not, Shiki reads past the shorter one and throws. With no
      // limit both passes finish, so a slow line costs time instead of a failed render.
      tokenizeTimeLimit: 0,
    })
    for (const line of lines) {
      for (const token of line) {
        let at = token.offset
        for (const part of token.explanation ?? []) {
          const kind = kindForScopes(part.scopes.map(scope => scope.scopeName))
          const to = at + part.content.length
          const previous = tokens.at(-1)
          if (kind !== undefined) {
            if (previous?.kind === kind && previous.to === at)
              tokens[tokens.length - 1] = { ...previous, to }
            else tokens.push({ from: at, to, kind })
          }
          at = to
        }
      }
    }
    if (cache.size >= CACHED_TEXTS) cache.delete(cache.keys().next().value!)
    cache.set(text, tokens)
    return tokens
  }
}

/** A tokenizer for every language the highlighter has loaded, under each of its names. */
export const shikiTokenizers = (highlighter: HighlighterCore): ReadonlyMap<string, CodeTokenizer> =>
  new Map(
    highlighter
      .getLoadedLanguages()
      .map(language => [language, shikiTokenizer(highlighter, language)]),
  )
