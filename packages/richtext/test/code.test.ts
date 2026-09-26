/**
 * Code highlighting as decorations (§124 §7, §130): a tokenizer reads a `CodeBlock`'s text and
 * its tokens become decorations. Nothing here changes the document.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const code = (id: string, runs: ReadonlyArray<string>, props: Record<string, unknown> = {}) => ({
  type: 'Node',
  kind: 'CodeBlock',
  id,
  props,
  children: runs.map((text, index) => ({ type: 'Text', id: `${id}-${index}`, text, marks: [] })),
})

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      code('json', ['{"a": 1', '2}'], { language: 'json' }),
      code('other', ['x = 3'], { language: 'python' }),
      code('bare', ['4']),
      { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 'pt', text: '5', marks: [] }] },
      {
        type: 'Node',
        kind: 'Quote',
        id: 'quote',
        props: {},
        children: [],
        blocks: [code('nested', ['[6]'], { language: 'json' })],
      },
    ],
  })

/** Every run of digits, which is enough grammar to tell the blocks apart. */
const numbers: RichText.CodeTokenizer = text =>
  Array.from(text.matchAll(/\d+/g), match => ({
    from: match.index,
    to: match.index + match[0].length,
    kind: 'syntax-number',
  }))

const spans = (tokenizers: ReadonlyMap<string, RichText.CodeTokenizer>) =>
  RichText.codeDecorations(document(), tokenizers).map(decoration => [
    decoration.kind,
    decoration.from.node,
    decoration.from.offset,
    decoration.to.node,
    decoration.to.offset,
  ])

describe('code highlighting as decorations', () => {
  it('tokenizes each code block by its language, nested ones included', () => {
    // `12` spans the block's two runs and stays one token; `3` is Python, which nothing
    // tokenizes; `4` names no language; `5` is a paragraph, not code.
    expect(spans(new Map([['json', numbers]]))).toEqual([
      ['syntax-number', 'json-0', 6, 'json-1', 1],
      ['syntax-number', 'nested-0', 1, 'nested-0', 2],
    ])
  })

  it('hands a tokenizer the block’s whole text, across its runs', () => {
    const seen: Array<string> = []
    RichText.codeDecorations(
      document(),
      new Map([['json', (text: string) => (seen.push(text), [])]]),
    )
    expect(seen).toEqual(['{"a": 12}', '[6]'])
  })

  it('is nothing with no tokenizer registered', () => {
    expect(spans(new Map())).toEqual([])
  })

  it.each([
    ['past the text', { from: 7, to: 10 }],
    ['before the text', { from: -1, to: 1 }],
    ['covering nothing', { from: 2, to: 2 }],
    ['between characters', { from: 0.5, to: 2 }],
  ])('refuses a token %s, naming the language', (_, range) => {
    const broken: RichText.CodeTokenizer = () => [{ ...range, kind: 'syntax-bad' }]
    expect(() => RichText.codeDecorations(document(), new Map([['python', broken]]))).toThrow(
      /python/,
    )
  })
})
