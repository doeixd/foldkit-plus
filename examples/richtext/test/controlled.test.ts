/**
 * The controlled-Bundle proof (§27). Each case drives one parent transition and
 * asserts what that single step committed, or deliberately did not.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import {
  application,
  pressed,
  selected,
  toggled,
  typed,
  update,
  type Model,
  type ParentMessage,
} from '../src/controlled.js'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const range = (
  anchor: readonly [string, number],
  focus: readonly [string, number],
): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(anchor[0]), offset: anchor[1], affinity: 'after' },
  focus: { node: id(focus[0]), offset: focus[1], affinity: 'after' },
})
const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [{ type: 'Text', id: 'a', text: 'ab', marks: [] }],
      },
      {
        type: 'Paragraph',
        id: 'q',
        children: [{ type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] }],
      },
    ],
  })

/** Startup runs the placement's init, which owns only the interaction fields. */
const start = (selection: RichText.Selection | null): Model => {
  const model = application.initial({ document: document() }).model
  return { ...model, editor: { ...model.editor, selection } }
}
const step = (model: Model, message: ParentMessage): Model => update(model, message).model

describe('one transition commits document and interaction state', () => {
  it('types through the child and lands both halves in the parent', () => {
    const before = start(caret('a', 2))
    const after = step(before, typed('!'))
    expect(after.document.children[0]?.children[0]?.text).toBe('ab!')
    expect(after.editor.selection).toEqual(caret('a', 3))
    // The parent holds exactly one document; the editor field is interaction only.
    expect(Object.keys(after).sort()).toEqual(['document', 'editor'])
    expect(Object.keys(after.editor).sort()).toEqual(['nextId', 'selection'])
  })

  it('carries no document copy between transitions', () => {
    const before = start(caret('a', 2))
    const after = step(before, typed('!'))
    expect(after.document).not.toBe(before.document)
    // The second transition reads the document the first one committed.
    const third = step(after, typed('?'))
    expect(third.document.children[0]?.children[0]?.text).toBe('ab!?')
    expect(third.editor.selection).toEqual(caret('a', 4))
  })

  it('splits a block with identities minted from the parent-owned counter', () => {
    const entered = step(start(caret('a', 1)), pressed('Entered'))
    expect(entered.document.children.map(block => block.id)).toEqual(['p', 'e1', 'q'])
    expect(entered.document.children[1]?.children[0]?.id).toBe('e0')
    expect(entered.editor.nextId).toBe(2)
    expect(entered.editor.selection).toEqual(caret('e0', 0))
  })

  it('applies a mark across a range in the same step', () => {
    const selectedRange = step(start(caret('a', 0)), selected(range(['a', 0], ['a', 2])))
    const marked = step(selectedRange, toggled('Italic'))
    expect(marked.document.children[0]?.children[0]).toEqual({
      type: 'Text',
      id: 'a',
      text: 'ab',
      marks: ['Italic'],
    })
    expect(marked.editor.selection).toEqual(range(['a', 0], ['a', 2]))
  })

  it('joins blocks when a delete crosses a block edge', () => {
    const joined = step(start(caret('b', 0)), pressed('Backspace'))
    expect(joined.document.children.map(block => block.id)).toEqual(['p'])
    expect(joined.document.children[0]?.children.map(run => run.id)).toEqual(['a', 'b'])
    expect(joined.editor.selection).toEqual(caret('a', 2))
  })
})

describe('rejection and external replacement', () => {
  it('leaves document, selection, and identities untouched when a command is refused', () => {
    const before = start(null)
    const rejected = step(before, typed('x'))
    // The write-back rebuilds the parent object, but nothing it holds changed.
    expect(rejected).toEqual(before)
    expect(rejected.document).toBe(before.document)
    expect(rejected.editor.nextId).toBe(0)
  })

  it('resolves the next command against a document replaced from outside', () => {
    const before = start(caret('a', 2))
    const replaced: Model = {
      document: RichText.decodeDocument({
        version: 1,
        children: [
          {
            type: 'Paragraph',
            id: 'p',
            children: [{ type: 'Text', id: 'a', text: 'Z', marks: [] }],
          },
        ],
      }),
      editor: { selection: caret('a', 1), nextId: before.editor.nextId },
    }
    const after = step(replaced, typed('!'))
    expect(after.document.children[0]?.children[0]?.text).toBe('Z!')
    expect(after.editor.selection).toEqual(caret('a', 2))
  })
})
