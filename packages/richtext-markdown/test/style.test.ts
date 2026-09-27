/**
 * The Markdown style (§138): parsing reads how the text spelled each construct, and printing
 * with that style spells it the same way again — unless the spelling would change what the
 * Markdown means, when the canonical text prints instead.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { parse, print, type MarkdownStyle } from '../src/index.js'

/** A style's spelling per construct, without the per-block map. */
const constructs = ({ blocks: _, ...rest }: MarkdownStyle) => rest

const minted = () => {
  let n = 0
  return { mint: () => `m${++n}` }
}

/** Every construct in its less common spelling, laid out as the printer lays text out. */
const alternate = [
  'Title',
  '=====',
  '',
  '### Deeper',
  '',
  '_a_ and __b__',
  '',
  '* x',
  '* y',
  '',
  '1) one',
  '2) two',
  '',
  '~~~js',
  'code',
  '~~~',
  '',
  '***',
  '',
].join('\n')

describe('the style a text was written in', () => {
  it('is read from the first spelling of each construct', () => {
    expect(constructs(parse(alternate, minted()).style)).toEqual({
      emphasis: '_',
      strong: '__',
      bullet: '*',
      delimiter: ')',
      fence: '~',
      rule: '*',
      heading: 'setext',
    })
    expect(constructs(parse('*a* then _b_, **c** then __d__\n', minted()).style)).toEqual({
      emphasis: '*',
      strong: '**',
    })
    expect(
      constructs(parse('- a\n\nb\n\n* c\n\n~~~\nd\n~~~\n\n```\ne\n```\n', minted()).style),
    ).toEqual({ bullet: '-', fence: '~' })
  })

  it('leaves out what the text never spells, and an indented code block, which has no fence', () => {
    expect(parse('plain\n\n    indented code\n', minted()).style).toEqual({ blocks: {} })
  })

  it('prints a document the way its text spelled it', () => {
    const parsed = parse(alternate, minted())
    expect(print(parsed.document, { style: parsed.style }).markdown).toBe(alternate)
    // Without the style, the same document prints canonically.
    expect(print(parsed.document).markdown).toBe(
      '# Title\n\n### Deeper\n\n*a* and **b**\n\n- x\n- y\n\n1. one\n2. two\n\n```js\ncode\n```\n\n---\n',
    )
  })

  it('prints canonically where the style would change the meaning, as `_` inside a word does', () => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Paragraph',
          id: 'p',
          children: [
            { type: 'Text', id: 'a', text: 'un', marks: [] },
            { type: 'Text', id: 'b', text: 'frig', marks: ['Italic'] },
            { type: 'Text', id: 'c', text: 'able', marks: [] },
          ],
        },
      ],
    })
    expect(print(document, { style: { emphasis: '_' } }).markdown).toBe('un*frig*able\n')
    // Control: the same style where it keeps the meaning.
    const spaced = parse('un _frig_ able\n', minted())
    expect(print(spaced.document, { style: spaced.style }).markdown).toBe('un _frig_ able\n')
  })

  it.each([
    ['two lists with different bullets', '- a\n\nbetween\n\n* b\n'],
    ['a setext title over an ATX section', 'Title\n=====\n\n## Section\n'],
    ['fences and rules spelled two ways', '~~~\nx\n~~~\n\n```\ny\n```\n\n***\n\n___\n'],
    ['numbered lists with different delimiters', '1. a\n\nbetween\n\n1) b\n'],
  ])('keeps each block’s own spelling: %s', (_, markdown) => {
    const parsed = parse(markdown, minted())
    expect(print(parsed.document, { style: parsed.style }).markdown).toBe(markdown)
    // Control: one spelling per construct cannot say this text.
    expect(print(parsed.document, { style: constructs(parsed.style) }).markdown).not.toBe(markdown)
  })

  it('spells a block the text did not have the way its construct was spelled', () => {
    const parsed = parse('* a\n', minted())
    const added = RichText.decodeDocument({
      version: 1,
      children: [
        ...parsed.document.children,
        {
          type: 'Paragraph',
          id: 'p',
          children: [{ type: 'Text', id: 'p-t', text: 'x', marks: [] }],
        },
        {
          type: 'Node',
          kind: 'List',
          id: 'new',
          props: {},
          children: [],
          blocks: [
            {
              type: 'Node',
              kind: 'ListItem',
              id: 'new-i',
              props: {},
              children: [],
              blocks: [
                {
                  type: 'Paragraph',
                  id: 'new-p',
                  children: [{ type: 'Text', id: 'new-t', text: 'b', marks: [] }],
                },
              ],
            },
          ],
        },
      ],
    } as never)
    expect(print(added, { style: parsed.style }).markdown).toBe('* a\n\nx\n\n* b\n')
  })
})
