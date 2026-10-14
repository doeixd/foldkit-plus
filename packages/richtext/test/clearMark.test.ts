/**
 * `ClearMark` given a mark value: only the runs carrying exactly that value lose it, so one
 * discussion's highlight is resolved without taking another's inside it.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const comment = (thread: string) => ({ name: 'Comment', props: { thread } })
const run = (name: string, text: string, marks: ReadonlyArray<unknown>) => ({
  type: 'Text',
  id: name,
  text,
  marks,
})
// "outer [inner] outer", with the middle run carrying the second discussion instead.
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          run('a', 'one ', [comment('outer')]),
          run('b', 'two', [comment('inner')]),
          run('c', ' three', [comment('outer'), 'Bold']),
        ],
      },
    ],
  })
const across: RichText.Selection = {
  type: 'Range',
  anchor: { node: id('a'), offset: 0, affinity: 'after' },
  focus: { node: id('c'), offset: 6, affinity: 'before' },
}
const clear = (mark: string | RichText.MarkValue) => {
  const result = RichText.run(
    { document: document(), selection: across },
    { type: 'ClearMark', mark },
    { mint: () => 'unused' },
  )
  if (!result.ok) throw new Error(result.error)
  return result.state.document.children[0]!.children.map(entry => [entry.text, entry.marks])
}

describe('ClearMark', () => {
  it('by value, leaves a different value of the same mark alone', () => {
    expect(clear(comment('outer'))).toEqual([
      ['one ', []],
      ['two', [comment('inner')]],
      [' three', ['Bold']],
    ])
  })

  it('by name, clears every value', () => {
    // Runs left with equal marks are one run again.
    expect(clear('Comment')).toEqual([
      ['one two', []],
      [' three', ['Bold']],
    ])
  })
})
