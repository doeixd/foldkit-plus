/**
 * Find and replace: one match or every match becomes the replacement, as one transaction, reading
 * each match again where the replacements after it left the text.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'Cat and ca', marks: [] },
          // A match across two runs: `ca` here and `t` in the next.
          { type: 'Text', id: 'b', text: 't', marks: ['Bold'] },
          { type: 'Text', id: 'c', text: ' cat', marks: [] },
        ],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'd', text: 'no match', marks: [] }],
      },
    ],
  })
const replace = (command: Omit<Extract<RichText.Command, { type: 'Replace' }>, 'type'>) => {
  let next = 0
  return RichText.run(
    { document: document(), selection: null },
    { type: 'Replace', ...command },
    { mint: () => `m${next++}` },
  )
}
const text = (result: RichText.TransactionResult) => {
  if (!result.ok) throw new Error(result.error)
  return result.state.document.children.map(block => block.children.map(run => run.text).join(''))
}

describe('Replace', () => {
  it('replaces every match, whatever its case, across runs too', () => {
    expect(text(replace({ query: 'cat', replacement: 'dog' }))).toEqual([
      'dog and dog dog',
      'no match',
    ])
  })

  it('keeps case when asked', () => {
    expect(text(replace({ query: 'cat', replacement: 'dog', caseSensitive: true }))).toEqual([
      'Cat and dog dog',
      'no match',
    ])
  })

  it('replaces only the match at an index, in document order', () => {
    expect(text(replace({ query: 'cat', replacement: 'dog', at: 1 }))).toEqual([
      'Cat and dog cat',
      'no match',
    ])
  })

  it('deletes matches when the replacement is empty', () => {
    expect(text(replace({ query: 'cat', replacement: '' }))).toEqual([' and  ', 'no match'])
  })

  it('leaves the caret after the earliest replacement', () => {
    const result = replace({ query: 'cat', replacement: 'dog' })
    expect(result.ok && result.state.selection).toMatchObject({
      type: 'Range',
      anchor: { node: 'a', offset: 3 },
    })
  })

  it('changes nothing when nothing matches, or the index is past the matches', () => {
    for (const result of [
      replace({ query: 'zebra', replacement: 'x' }),
      replace({ query: 'cat', replacement: 'x', at: 9 }),
    ]) {
      expect(result.ok && result.state.document).toEqual(document())
    }
  })
})
