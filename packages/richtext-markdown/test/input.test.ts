/**
 * The Markdown block input rules (§124 §4): completing a heading marker at a block's start
 * retypes the block. The markers that would need a container or an atom are not claimed
 * yet, and the module says so.
 */
import { describe, expect, it } from 'vitest'
import { markdownInputRules } from '../src/input.js'

/** The first rule that has something to say about this text, as the editor would find it. */
const match = (textBefore: string) => {
  for (const rule of markdownInputRules) {
    const matched = rule.match(textBefore)
    if (matched !== undefined) return { name: rule.name, ...matched }
  }
  return undefined
}

describe('the Markdown block input rules', () => {
  it('retypes a block when a heading marker is completed at its start', () => {
    expect(match('# ')).toEqual({
      name: 'heading-1',
      remove: 2,
      commands: [{ type: 'RetypeBlock', to: { type: 'Heading', level: 1 } }],
    })
    expect(match('###### ')).toEqual({
      name: 'heading-6',
      remove: 7,
      commands: [{ type: 'RetypeBlock', to: { type: 'Heading', level: 6 } }],
    })
  })

  it('reads the level from the run of hashes, not from the space alone', () => {
    expect(match('### ')?.commands).toEqual([
      { type: 'RetypeBlock', to: { type: 'Heading', level: 3 } },
    ])
    // The space is part of the marker, so one more hash is a different rule.
    expect(match('## ')).not.toEqual(match('### '))
  })

  it('claims nothing mid-block, over-deep, or under-complete', () => {
    for (const text of ['see # ', '####### ', '#', '# text', '#  ']) {
      expect(match(text)).toBeUndefined()
    }
  })
})
