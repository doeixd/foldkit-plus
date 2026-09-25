/**
 * The JSON grammar (§130): what a `CodeBlock`'s text lexes to, and what the core producer makes
 * of it.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { JSON_LANGUAGE, jsonTokenizer, tokenizeJson } from '../src/index.js'

/** Each token as `[kind, the text it covers]`, which is what a lexer is judged by. */
const lexed = (text: string) =>
  tokenizeJson(text).map(token => [token.kind, text.slice(token.from, token.to)])

describe('lexing JSON', () => {
  it('reads the literals, strings with their escapes, numbers, and punctuation', () => {
    expect(lexed('{"a": [1, -2.5e3, true, false, null], "b": "x\\"y"}')).toEqual([
      ['punctuation', '{'],
      ['string', '"a"'],
      ['punctuation', ':'],
      ['punctuation', '['],
      ['number', '1'],
      ['punctuation', ','],
      ['number', '-2.5e3'],
      ['punctuation', ','],
      ['boolean', 'true'],
      ['punctuation', ','],
      ['boolean', 'false'],
      ['punctuation', ','],
      ['null', 'null'],
      ['punctuation', ']'],
      ['punctuation', ','],
      ['string', '"b"'],
      ['punctuation', ':'],
      ['string', '"x\\"y"'],
      ['punctuation', '}'],
    ])
  })

  it('skips whitespace, and reports a character that begins no token', () => {
    expect(lexed('  \n\t1')).toEqual([['number', '1']])
    expect(lexed('{"a" $ }')).toEqual([
      ['punctuation', '{'],
      ['string', '"a"'],
      ['invalid', '$'],
      ['punctuation', '}'],
    ])
  })

  it('runs an unterminated string to the end instead of inventing a close', () => {
    expect(lexed('{"a": "oops}')).toEqual([
      ['punctuation', '{'],
      ['string', '"a"'],
      ['punctuation', ':'],
      ['string', '"oops}'],
    ])
  })

  it('accounts for every character as one token or as whitespace', () => {
    const text = '{"n": -0.5, "s": "a\\nb", "b": [true, null]}'
    const covered = tokenizeJson(text).reduce((total, token) => total + token.to - token.from, 0)
    const spaces = (text.match(/\s/g) ?? []).length
    expect(covered + spaces).toBe(text.length)
  })
})

describe('highlighting a JSON code block', () => {
  it('reads the tokens as decorations through the core producer', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'code',
          props: { language: JSON_LANGUAGE },
          children: [{ type: 'Text', id: 't', text: '{"a": 1}', marks: [] }],
        },
      ],
    })
    expect(
      RichText.codeDecorations(document, [jsonTokenizer]).map(decoration => [
        decoration.kind,
        decoration.data,
      ]),
    ).toEqual([
      ['syntax-punctuation', { token: 'punctuation' }],
      ['syntax-string', { token: 'string' }],
      ['syntax-punctuation', { token: 'punctuation' }],
      ['syntax-number', { token: 'number' }],
      ['syntax-punctuation', { token: 'punctuation' }],
    ])
  })
})
