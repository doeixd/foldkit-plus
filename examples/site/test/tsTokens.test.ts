/**
 * The theme code's tokenizer: each kind it names lands on the run it names,
 * so `/create`'s code reads in the theme's syntax colors.
 */
import { describe, expect, it } from 'vitest'
import { tsTokens } from '../src/view/tsTokens.js'

const kinds = (code: string) =>
  tsTokens(code).map(token => [code.slice(token.from, token.to), token.kind])

describe('tsTokens', () => {
  it('names keywords, types, calls, keys, strings, numbers and punctuation', () => {
    expect(kinds("import { Theme } from 'x'")).toEqual([
      ['import', 'syntax-keyword'],
      ['{', 'syntax-punctuation'],
      ['Theme', 'syntax-type'],
      ['}', 'syntax-punctuation'],
      ['from', 'syntax-keyword'],
      ["'x'", 'syntax-string'],
    ])
    expect(kinds("Theme.oklch({ accent: { h: 152 }, 'radius-factor': '0.8' })")).toEqual([
      ['Theme', 'syntax-type'],
      ['.', 'syntax-punctuation'],
      ['oklch', 'syntax-function'],
      ['(', 'syntax-punctuation'],
      ['{', 'syntax-punctuation'],
      ['accent', 'syntax-property'],
      [':', 'syntax-punctuation'],
      ['{', 'syntax-punctuation'],
      ['h', 'syntax-property'],
      [':', 'syntax-punctuation'],
      ['152', 'syntax-number'],
      ['}', 'syntax-punctuation'],
      [',', 'syntax-punctuation'],
      ["'radius-factor'", 'syntax-property'],
      [':', 'syntax-punctuation'],
      ["'0.8'", 'syntax-string'],
      ['}', 'syntax-punctuation'],
      [')', 'syntax-punctuation'],
    ])
  })

  it('keeps an escaped quote inside its string, and a comment to the line end', () => {
    expect(kinds("'it\\'s' // done")).toEqual([
      ["'it\\'s'", 'syntax-string'],
      ['// done', 'syntax-comment'],
    ])
  })

  it('leaves a lowercase word that is no call or key uncolored', () => {
    expect(kinds('a = b')).toEqual([['=', 'syntax-punctuation']])
  })
})
