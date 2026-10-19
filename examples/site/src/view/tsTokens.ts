/**
 * A small TypeScript tokenizer for the theme code `/create` writes as the
 * knobs turn: it changes in the browser, where the build's Shiki is not.
 * It knows that code's shapes (imports, calls, object keys, strings,
 * numbers), not the whole language.
 */
import type { CodeBlock } from 'foldkit-mixins-ui'

const KEYWORDS = new Set(['import', 'from', 'export', 'const', 'type', 'true', 'false'])
const LEXEME =
  /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\/\/[^\n]*)|(\d+(?:\.\d+)?)|([A-Za-z_$][\w$]*)|([{}()[\],.:;=])/y

export const tsTokens = (code: string): ReadonlyArray<CodeBlock.CodeToken> => {
  const tokens: Array<CodeBlock.CodeToken> = []
  let at = 0
  while (at < code.length) {
    LEXEME.lastIndex = at
    const match = LEXEME.exec(code)
    if (match === null) {
      at += 1
      continue
    }
    const [lexeme, string, comment, number, word] = match
    const to = at + lexeme.length
    const next = code.slice(to).match(/^\s*(.)/)?.[1]
    const kind =
      string !== undefined
        ? next === ':'
          ? 'syntax-property'
          : 'syntax-string'
        : comment !== undefined
          ? 'syntax-comment'
          : number !== undefined
            ? 'syntax-number'
            : word !== undefined
              ? KEYWORDS.has(word)
                ? 'syntax-keyword'
                : next === '('
                  ? 'syntax-function'
                  : next === ':'
                    ? 'syntax-property'
                    : /^[A-Z]/.test(word)
                      ? 'syntax-type'
                      : undefined
              : 'syntax-punctuation'
    if (kind !== undefined) tokens.push({ from: at, to, kind })
    at = to
  }
  return tokens
}
