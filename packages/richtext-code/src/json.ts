/**
 * A JSON tokenizer (§130): exact to JSON's grammar, and total over any text, because what a
 * code block holds while someone types is usually not valid JSON yet. It never throws, and
 * every token lies inside the text, in order, without overlap — `codeDecorations` refuses a
 * token outside the text, and the order is this lexer's own — so a half-typed document
 * highlights what it can and leaves the rest plain.
 */
import type { CodeToken, CodeTokenizer } from 'foldkit-richtext'

// Sticky, so each is tried exactly at the cursor. A string may end unterminated at a line
// break or the end of the text: it is still a string while its closing quote is being typed.
const WHITESPACE = /\s+/y
const STRING = /"(?:[^"\\\n]|\\[^\n])*(?:"|\\?(?=\n|$))/y
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y
const WORD = /[A-Za-z_$][\w$]*/y
const PUNCTUATION = /[{}[\]:,]/y
const KEYWORDS = new Set(['true', 'false', 'null'])

/** Whether a colon follows `at` past any whitespace, which is what makes a string a key. */
const colonFollows = (text: string, at: number): boolean => {
  WHITESPACE.lastIndex = at
  const skipped = WHITESPACE.exec(text)
  return text[skipped === null ? at : at + skipped[0].length] === ':'
}

/**
 * JSON's tokens as `syntax-property` (an object key), `syntax-string`, `syntax-number`,
 * `syntax-keyword` (`true`, `false`, `null`), and `syntax-punctuation`. A character JSON has
 * no token for — a stray letter, a `-` with no digits — gets none, and the scan moves on.
 */
export const jsonTokenizer: CodeTokenizer = text => {
  const tokens: Array<CodeToken> = []
  let at = 0
  const match = (pattern: RegExp): string | undefined => {
    pattern.lastIndex = at
    return pattern.exec(text)?.[0]
  }
  while (at < text.length) {
    const space = match(WHITESPACE)
    if (space !== undefined) {
      at += space.length
      continue
    }
    const string = match(STRING)
    const number = string === undefined ? match(NUMBER) : undefined
    const word = string === undefined && number === undefined ? match(WORD) : undefined
    const punctuation =
      string === undefined && number === undefined && word === undefined
        ? match(PUNCTUATION)
        : undefined
    const lexeme = string ?? number ?? word ?? punctuation
    if (lexeme === undefined) {
      at += 1
      continue
    }
    const to = at + lexeme.length
    const kind =
      string !== undefined
        ? colonFollows(text, to)
          ? 'syntax-property'
          : 'syntax-string'
        : number !== undefined
          ? 'syntax-number'
          : punctuation !== undefined
            ? 'syntax-punctuation'
            : KEYWORDS.has(lexeme)
              ? 'syntax-keyword'
              : undefined
    if (kind !== undefined) tokens.push({ from: at, to, kind })
    at = to
  }
  return tokens
}
