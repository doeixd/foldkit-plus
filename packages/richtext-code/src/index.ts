/**
 * The JSON grammar for code highlighting (§124 §7, §130): `jsonTokenizer` reads a `CodeBlock`
 * whose language is `json` as tokens, which `codeDecorations` turns into decorations and the
 * read-only view draws.
 *
 * JSON is the first grammar because it can be written *exactly* — its lexing is small enough to
 * state completely and verify — and because it is common in CMS content. TypeScript and
 * JavaScript are deliberately not hand-rolled here: a lexer that is half right is worse than
 * none, and they wait for Shiki (§124 §7, §130).
 */
import type { CodeToken, CodeTokenizer } from 'foldkit-richtext'

/** The language a `CodeBlock` names to have this tokenizer used. */
export const JSON_LANGUAGE = 'json'

/** What a JSON token can be; the producer turns each into a `syntax-<kind>` decoration. */
export type JsonTokenKind = 'string' | 'number' | 'boolean' | 'null' | 'punctuation' | 'invalid'

const WHITESPACE = /\s/
const PUNCTUATION = new Set(['{', '}', '[', ']', ':', ','])

/** The words JSON spells out, and the kind each one is. */
const LITERALS: ReadonlyArray<readonly [string, JsonTokenKind]> = [
  ['true', 'boolean'],
  ['false', 'boolean'],
  ['null', 'null'],
]

/**
 * The end of the string that opens at `from`, escapes included. An unterminated string ends at
 * the end of the text, so the caller reports one string token rather than inventing a close.
 */
const endOfString = (text: string, from: number): number => {
  let at = from + 1
  while (at < text.length) {
    const character = text.charAt(at)
    if (character === '\\') {
      at += 2
      continue
    }
    if (character === '"') return at + 1
    at += 1
  }
  return text.length
}

/**
 * One JSON text, lexed. Whitespace is skipped rather than tokenized; a character that begins no
 * token is one `invalid` token rather than an error, so a renderer can show it as it likes; and
 * everything else is exact — strings with their escapes, numbers by JSON's own shape, the three
 * literals, and the punctuation.
 */
export const tokenizeJson = (text: string): ReadonlyArray<CodeToken> => {
  // Sticky, so a number matches at the cursor instead of by slicing the rest of the text, which
  // would make the walk quadratic in the block's length.
  const number = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y
  const tokens: Array<CodeToken> = []
  let at = 0
  while (at < text.length) {
    const character = text.charAt(at)
    if (WHITESPACE.test(character)) {
      at += 1
      continue
    }
    if (character === '"') {
      const end = endOfString(text, at)
      tokens.push({ from: at, to: end, kind: 'string' })
      at = end
      continue
    }
    if (PUNCTUATION.has(character)) {
      tokens.push({ from: at, to: at + 1, kind: 'punctuation' })
      at += 1
      continue
    }
    const literal = LITERALS.find(([word]) => text.startsWith(word, at))
    if (literal !== undefined) {
      tokens.push({ from: at, to: at + literal[0].length, kind: literal[1] })
      at += literal[0].length
      continue
    }
    number.lastIndex = at
    const digits = number.exec(text)
    if (digits !== null) {
      tokens.push({ from: at, to: at + digits[0].length, kind: 'number' })
      at += digits[0].length
      continue
    }
    tokens.push({ from: at, to: at + 1, kind: 'invalid' })
    at += 1
  }
  return tokens
}

/** The JSON grammar, ready for `codeDecorations`. */
export const jsonTokenizer: CodeTokenizer = {
  language: JSON_LANGUAGE,
  tokenize: tokenizeJson,
}
