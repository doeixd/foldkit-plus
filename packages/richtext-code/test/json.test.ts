/**
 * The JSON tokenizer (§130): exact on JSON, and total on anything else, because a code block
 * mid-edit is rarely valid.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { jsonTokenizer } from 'foldkit-richtext-code'

/** Each token as the text it covers and its kind. */
const read = (text: string) =>
  jsonTokenizer(text).map(token => [text.slice(token.from, token.to), token.kind])

describe('tokenizing JSON', () => {
  it('names every kind JSON has, and tells a key from a string value', () => {
    expect(read('{"key" : "value", "n": -1.5e+3, "ok": [true, false, null]}')).toEqual([
      ['{', 'syntax-punctuation'],
      ['"key"', 'syntax-property'],
      [':', 'syntax-punctuation'],
      ['"value"', 'syntax-string'],
      [',', 'syntax-punctuation'],
      ['"n"', 'syntax-property'],
      [':', 'syntax-punctuation'],
      ['-1.5e+3', 'syntax-number'],
      [',', 'syntax-punctuation'],
      ['"ok"', 'syntax-property'],
      [':', 'syntax-punctuation'],
      ['[', 'syntax-punctuation'],
      ['true', 'syntax-keyword'],
      [',', 'syntax-punctuation'],
      ['false', 'syntax-keyword'],
      [',', 'syntax-punctuation'],
      ['null', 'syntax-keyword'],
      [']', 'syntax-punctuation'],
      ['}', 'syntax-punctuation'],
    ])
  })

  it('keeps an escaped quote inside its string', () => {
    expect(read('"a\\"b" "c\\\\"')).toEqual([
      ['"a\\"b"', 'syntax-string'],
      ['"c\\\\"', 'syntax-string'],
    ])
  })

  it.each([
    ['at the end of the text', '"open', [['"open', 'syntax-string']]],
    [
      'at a line break',
      '"open\n1',
      [
        ['"open', 'syntax-string'],
        ['1', 'syntax-number'],
      ],
    ],
    ['after a trailing backslash', '"open\\', [['"open\\', 'syntax-string']]],
  ])('ends an unterminated string %s', (_, text, expected) => {
    expect(read(text)).toEqual(expected)
  })

  it('gives nothing JSON has no token for, and carries on after it', () => {
    // `truthy` is a word but not a keyword, and a bare `-` is not a number.
    expect(read('truthy - @ 7')).toEqual([['7', 'syntax-number']])
  })

  it('keeps every token inside the text, in order, on any input', () => {
    const alphabet = '{}[]:,"\\-+.eE0123456789 \ntruefalsnl@x'
    let seed = 7
    const next = () => (seed = (seed * 48271) % 2147483647)
    for (let sample = 0; sample < 500; sample += 1) {
      const text = Array.from(
        { length: next() % 40 },
        () => alphabet[next() % alphabet.length],
      ).join('')
      let previous = 0
      for (const token of jsonTokenizer(text)) {
        expect(token.from).toBeGreaterThanOrEqual(previous)
        expect(token.to).toBeGreaterThan(token.from)
        expect(token.to).toBeLessThanOrEqual(text.length)
        previous = token.to
      }
    }
  })

  it('produces decorations a code block accepts', () => {
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
    const kinds = RichText.codeDecorations(document, new Map([['json', jsonTokenizer]])).map(
      decoration => decoration.kind,
    )
    expect(kinds).toContain('syntax-property')
    expect(kinds).toContain('syntax-number')
  })
})
