/**
 * The Markdown style (§138): parsing reads how the text spelled each construct, and printing
 * with that style spells it the same way again — unless the spelling would change what the
 * Markdown means, when the canonical text prints instead.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { parse, print } from '../src/index.js'

const minted = () => {
  let n = 0
  return { mint: () => `m${++n}` }
}

/** Every construct in its less common spelling, laid out as the printer lays text out. */
const alternate = [
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
    expect(parse(alternate, minted()).style).toEqual({
      emphasis: '_',
      strong: '__',
      bullet: '*',
      delimiter: ')',
      fence: '~',
      rule: '*',
    })
    expect(parse('*a* then _b_, **c** then __d__\n', minted()).style).toEqual({
      emphasis: '*',
      strong: '**',
    })
  })

  it('leaves out what the text never spells, and an indented code block, which has no fence', () => {
    expect(parse('plain\n\n    indented code\n', minted()).style).toEqual({})
  })

  it('prints a document the way its text spelled it', () => {
    const parsed = parse(alternate, minted())
    expect(print(parsed.document, { style: parsed.style }).markdown).toBe(alternate)
    // Without the style, the same document prints canonically.
    expect(print(parsed.document).markdown).toBe(
      '*a* and **b**\n\n- x\n- y\n\n1. one\n2. two\n\n```js\ncode\n```\n\n---\n',
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
})
