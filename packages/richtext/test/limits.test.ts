import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const tight: RichText.DocumentLimits = {
  maxBlocks: 2,
  maxTextRuns: 4,
  maxTextLength: 8,
}
const block = (id: string, runs: ReadonlyArray<{ id: string; length: number }>) => ({
  type: 'Paragraph',
  id,
  children: runs.map(run => ({
    type: 'Text',
    id: run.id,
    text: 'x'.repeat(run.length),
    marks: [],
  })),
})
const input = (blocks: ReadonlyArray<ReturnType<typeof block>>) => ({
  version: 1,
  children: blocks,
})

describe('document limits', () => {
  it('accepts empty and boundary-exact documents', () => {
    expect(RichText.decodeDocument({ version: 1, children: [] })).toEqual({
      version: 1,
      children: [],
    })
    expect(
      RichText.decodeDocument(
        input([block('a', [{ id: 'a0', length: 3 }]), block('b', [{ id: 'b0', length: 5 }])]),
        { maxBlocks: 2, maxTextRuns: 2, maxTextLength: 8 },
      ).children,
    ).toHaveLength(2)
  })

  it.each([
    ['blocks', input([block('a', []), block('b', []), block('c', [])]), tight, /maxBlocks: 3 > 2/],
    [
      'runs',
      input([block('a', [{ id: 'a0', length: 1 }]), block('b', [{ id: 'b0', length: 1 }])]),
      { ...tight, maxTextRuns: 1 },
      /maxTextRuns: 2 > 1/,
    ],
    ['text length', input([block('a', [{ id: 'a0', length: 9 }])]), tight, /maxTextLength: 9 > 8/],
  ] satisfies ReadonlyArray<readonly [string, unknown, RichText.DocumentLimits, RegExp]>)(
    'rejects documents over the %s bound with a named error',
    (_label, value, limits, message) => {
      expect(() => RichText.decodeDocument(value, limits)).toThrow(message)
    },
  )

  it('checks structure before limits and accepts widened bounds', () => {
    expect(() =>
      RichText.decodeDocument(
        { version: 1, children: [{ type: 'Embed', id: 'x' }] },
        { maxBlocks: 1, maxTextRuns: 1, maxTextLength: 1 },
      ),
    ).toThrow()
    const oversized = input([
      block('a', [
        { id: 'a0', length: 5 },
        { id: 'a1', length: 5 },
      ]),
    ])
    expect(() => RichText.decodeDocument(oversized, tight)).toThrow(/maxTextLength: 10 > 8/)
    expect(
      RichText.decodeDocument(oversized, { ...RichText.DefaultDocumentLimits, maxBlocks: 1 })
        .children,
    ).toHaveLength(1)
  })

  it('rejects non-positive limit shapes at construction', () => {
    expect(() =>
      RichText.DocumentLimits.make({ maxBlocks: 0, maxTextRuns: 1, maxTextLength: 1 }),
    ).toThrow()
    expect(() =>
      RichText.DocumentLimits.make({ maxBlocks: 1.5, maxTextRuns: 1, maxTextLength: 1 }),
    ).toThrow()
  })
})
