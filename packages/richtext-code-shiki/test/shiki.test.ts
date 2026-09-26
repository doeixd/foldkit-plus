/**
 * Shiki's grammars as code tokenizers (§130): scopes read as `syntax-*` kinds, tokens that
 * `codeDecorations` accepts, and a highlighter checked when the tokenizer is made.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import json from 'shiki/langs/json.mjs'
import typescript from 'shiki/langs/typescript.mjs'
import nord from 'shiki/themes/nord.mjs'
import { shikiTokenizer, shikiTokenizers } from 'foldkit-richtext-code-shiki'

const highlighter = createHighlighterCoreSync({
  themes: [nord],
  langs: [typescript, json],
  engine: createJavaScriptRegexEngine(),
})

/** Each token as the text it covers and its kind. */
const read = (language: string, text: string) =>
  shikiTokenizer(
    highlighter,
    language,
  )(text).map(token => [text.slice(token.from, token.to), token.kind])

describe('Shiki grammars as tokenizers', () => {
  it('reads TypeScript’s scopes as the shared kinds', () => {
    expect(read('typescript', 'const n = 1 // one\nfunction f() {}')).toEqual([
      ['const', 'syntax-keyword'],
      ['=', 'syntax-operator'],
      ['1', 'syntax-number'],
      ['// one', 'syntax-comment'],
      ['function', 'syntax-keyword'],
      ['f', 'syntax-function'],
      // The space between is plain text, so it separates two punctuation tokens.
      ['()', 'syntax-punctuation'],
      ['{}', 'syntax-punctuation'],
    ])
  })

  it('keeps a string’s quotes in the string, as one token', () => {
    expect(read('typescript', 'x = "hi"')).toContainEqual(['"hi"', 'syntax-string'])
  })

  it('reads a JSON key, which sits inside a string, as a property', () => {
    expect(read('json', '{"a": 2}')).toEqual([
      ['{', 'syntax-punctuation'],
      ['"a"', 'syntax-property'],
      [':', 'syntax-punctuation'],
      ['2', 'syntax-number'],
      ['}', 'syntax-punctuation'],
    ])
  })

  it('matches a scope by whole segments, a bare one included', () => {
    // A grammar of three words: `x` scoped plainly `string`; `y` scoped `stringy`, which only
    // shares its first letters with `string` and so is not one; and `z`, a `keyword.*` scope
    // TypeScript's grammar never emits, which is still a keyword.
    const probe = createHighlighterCoreSync({
      themes: [nord],
      langs: [
        {
          name: 'probe',
          scopeName: 'source.probe',
          patterns: [
            { match: 'x', name: 'string' },
            { match: 'y', name: 'stringy.probe' },
            { match: 'z', name: 'keyword.declaration.probe' },
          ],
          repository: {},
        },
      ],
      engine: createJavaScriptRegexEngine(),
    })
    const text = 'x y z'
    expect(
      shikiTokenizer(
        probe,
        'probe',
      )(text).map(token => [text.slice(token.from, token.to), token.kind]),
    ).toEqual([
      ['x', 'syntax-string'],
      ['z', 'syntax-keyword'],
    ])
  })

  it('offers every loaded language under each of its names', () => {
    const tokenizers = shikiTokenizers(highlighter)
    expect([...tokenizers.keys()]).toEqual(expect.arrayContaining(['typescript', 'ts', 'json']))
  })

  it('produces decorations a code block accepts, across its lines', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'c',
          props: { language: 'ts' },
          children: [{ type: 'Text', id: 't', text: 'let a = 1\nlet b = "two"', marks: [] }],
        },
      ],
    })
    const kinds = RichText.codeDecorations(document, shikiTokenizers(highlighter)).map(
      decoration => decoration.kind,
    )
    expect(kinds).toContain('syntax-string')
    expect(kinds.filter(kind => kind === 'syntax-keyword')).toHaveLength(2)
  })

  it('remembers what it read, and forgets the least recently read past its limit', () => {
    const tokenize = shikiTokenizer(highlighter, 'typescript')
    const kept = tokenize('let a = 1')
    const dropped = tokenize('let c = 3')
    expect(tokenize('let a = 1')).toBe(kept)
    // 63 new texts fill the cache; reading `a` again keeps it, so `c` is the one forgotten.
    for (let index = 0; index < 63; index += 1) {
      tokenize(`let b = ${index}`)
      tokenize('let a = 1')
    }
    expect(tokenize('let a = 1')).toBe(kept)
    expect(tokenize('let c = 3')).not.toBe(dropped)
    expect(tokenize('let c = 3')).toEqual(dropped)
  })

  it('keeps every token inside text with CRLF line ends, tabs, and astral characters', () => {
    const text = 'const s = "😀é"\r\n\tlet n = 2 // 😀\r\nf(n)'
    let previous = 0
    for (const token of shikiTokenizer(highlighter, 'typescript')(text)) {
      expect(token.from).toBeGreaterThanOrEqual(previous)
      expect(token.to).toBeLessThanOrEqual(text.length)
      previous = token.to
    }
    expect(read('typescript', text)).toContainEqual(['"😀é"', 'syntax-string'])
    expect(read('typescript', text)).toContainEqual(['2', 'syntax-number'])
  })

  it('refuses, when it is made, a language or a theme the highlighter lacks', () => {
    expect(() => shikiTokenizer(highlighter, 'python')).toThrow(/python/)
    const themeless = createHighlighterCoreSync({
      themes: [],
      langs: [json],
      engine: createJavaScriptRegexEngine(),
    })
    expect(() => shikiTokenizer(themeless, 'json')).toThrow(/theme/)
  })
})
