import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const id = RichText.NodeId.make
const document = (text: string) =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'a', text, marks: [] }],
      },
    ],
  })
const state = (text: string, offset = text.length): RichText.EditorState => ({
  document: document(text),
  selection: {
    type: 'Range',
    anchor: { node: id('a'), offset, affinity: 'after' },
    focus: { node: id('a'), offset, affinity: 'after' },
  },
})
const textOf = (current: RichText.EditorState) =>
  current.document.children[0]?.children[0]?.text ?? ''

describe('undo history', () => {
  it('records one step per commit and restores document and selection', () => {
    const first = state('a')
    const second = state('ab')
    const history = RichText.commit(RichText.emptyHistory, first)
    expect(RichText.canUndo(history)).toBe(true)
    expect(RichText.inspectHistory(history)).toEqual({ past: 1, future: 0, group: null })

    const back = RichText.undo(history, second)!
    expect(textOf(back.state)).toBe('a')
    expect(back.state.selection).toEqual(first.selection)
    expect(RichText.canUndo(back.history)).toBe(false)
    expect(RichText.canRedo(back.history)).toBe(true)

    const forward = RichText.redo(back.history, back.state)!
    expect(textOf(forward.state)).toBe('ab')
    expect(RichText.canRedo(forward.history)).toBe(false)
  })

  it('coalesces a typing burst into one undo step', () => {
    let history = RichText.emptyHistory
    const states = [state('a'), state('ab'), state('abc'), state('abcd')]
    for (let index = 1; index < states.length; index++) {
      history = RichText.commit(history, states[index - 1]!, { group: 'typing' })
    }
    expect(RichText.inspectHistory(history)).toEqual({ past: 1, future: 0, group: 'typing' })
    const back = RichText.undo(history, states[3]!)!
    expect(textOf(back.state)).toBe('a')
  })

  it('starts a new step for a discrete command after typing', () => {
    let history = RichText.emptyHistory
    const states = [state('a'), state('ab'), state('abc'), state('abcd')]
    history = RichText.commit(history, states[0]!, { group: 'typing' })
    history = RichText.commit(history, states[1]!, { group: 'typing' })
    history = RichText.commit(history, states[2]!)
    expect(RichText.inspectHistory(history).past).toBe(2)

    // The discrete step undoes on its own, then the whole typing burst.
    const back = RichText.undo(history, states[3]!)!
    expect(textOf(back.state)).toBe('abc')
    const again = RichText.undo(back.history, back.state)!
    expect(textOf(again.state)).toBe('a')
  })

  it('does not join a burst across a discrete step, or two discrete steps', () => {
    let history = RichText.emptyHistory
    const states = [state('a'), state('ab'), state('abc'), state('abcd')]
    history = RichText.commit(history, states[0]!, { group: 'typing' })
    history = RichText.commit(history, states[1]!) // a discrete step
    history = RichText.commit(history, states[2]!, { group: 'typing' })
    expect(RichText.inspectHistory(history).past).toBe(3)

    let discrete = RichText.emptyHistory
    discrete = RichText.commit(discrete, states[0]!)
    discrete = RichText.commit(discrete, states[1]!)
    expect(RichText.inspectHistory(discrete).past).toBe(2)
  })

  it('joins only the same group, not any group', () => {
    let history = RichText.emptyHistory
    const states = [state('a'), state('ab'), state('abc'), state('abcd')]
    history = RichText.commit(history, states[0]!, { group: 'typing' })
    history = RichText.commit(history, states[1]!, { group: 'other' })
    expect(RichText.inspectHistory(history)).toEqual({ past: 2, future: 0, group: 'other' })
    history = RichText.commit(history, states[2]!, { group: 'other' })
    expect(RichText.inspectHistory(history).past).toBe(2)
    const back = RichText.undo(history, states[3]!)!
    expect(textOf(back.state)).toBe('ab')
  })

  it('clears redo when a new edit lands after an undo', () => {
    const first = state('a')
    const second = state('ab')
    const history = RichText.commit(RichText.emptyHistory, first)
    const back = RichText.undo(history, second)!
    expect(RichText.canRedo(back.history)).toBe(true)
    const branched = RichText.commit(back.history, back.state, { group: 'typing' })
    expect(RichText.canRedo(branched)).toBe(false)
    expect(RichText.inspectHistory(branched)).toEqual({ past: 1, future: 0, group: 'typing' })
  })

  it('drops the oldest steps beyond capacity', () => {
    const states = [state('a'), state('ab'), state('abc'), state('abcd'), state('abcde')]
    let history = RichText.emptyHistory
    for (let index = 1; index < states.length; index++) {
      history = RichText.commit(history, states[index - 1]!, { capacity: 2 })
    }
    expect(RichText.inspectHistory(history).past).toBe(2)
    const back = RichText.undo(history, states[4]!)!
    expect(textOf(back.state)).toBe('abcd')
    const again = RichText.undo(back.history, back.state)!
    expect(textOf(again.state)).toBe('abc')
    expect(RichText.canUndo(again.history)).toBe(false)
  })

  it('reports an empty step instead of throwing', () => {
    const current = state('a')
    expect(RichText.undo(RichText.emptyHistory, current)).toBeUndefined()
    expect(RichText.redo(RichText.emptyHistory, current)).toBeUndefined()
    expect(RichText.canUndo(RichText.emptyHistory)).toBe(false)
    expect(RichText.canRedo(RichText.emptyHistory)).toBe(false)
  })

  it('leaves the history it was given untouched', () => {
    const history = RichText.commit(RichText.emptyHistory, state('a'))
    RichText.undo(history, state('ab'))
    expect(RichText.inspectHistory(history)).toEqual({ past: 1, future: 0, group: null })
    expect(RichText.inspectHistory(RichText.emptyHistory)).toEqual({
      past: 0,
      future: 0,
      group: null,
    })
  })

  it.each([
    [{ type: 'InsertText', text: 'x' } as const, 'typing'],
    [{ type: 'DeleteBackward' } as const, 'typing'],
    [{ type: 'DeleteForward' } as const, 'typing'],
    [{ type: 'SplitBlock' } as const, undefined],
    [{ type: 'ToggleMark', mark: 'Bold' } as const, undefined],
    [{ type: 'SetSelection', selection: null } as const, undefined],
  ])('groups %j as %s', (command, group) => {
    expect(RichText.groupFor(command)).toBe(group)
  })
})
