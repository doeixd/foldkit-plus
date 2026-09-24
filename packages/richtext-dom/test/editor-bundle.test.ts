/**
 * The controlled-Bundle proof (§27). Each case drives one parent transition and
 * asserts what that single step committed, or deliberately did not.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import {
  application,
  patched,
  pressed,
  redone,
  replaceChangeSet,
  selected,
  toggled,
  typed,
  undone,
  update,
  type Model,
  type ParentMessage,
} from '../src/editor-bundle.js'

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
    // The parent holds exactly one document; the editor field is the state the
    // child cannot own: interaction, its identity counter, and its host binding.
    expect(Object.keys(after).sort()).toEqual(['document', 'editor'])
    expect(Object.keys(after.editor).sort()).toEqual([
      'history',
      'hostId',
      'nextId',
      'selection',
      'storedMarks',
    ])
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

describe('undo through the parent transition', () => {
  it('collapses a typing burst into one step that restores text and caret', () => {
    let model = start(caret('a', 2))
    model = step(model, typed('X'))
    model = step(model, typed('Y'))
    model = step(model, typed('Z'))
    expect(model.document.children[0]?.children[0]?.text).toBe('abXYZ')
    expect(RichText.inspectHistory(model.editor.history)).toEqual({
      past: 1,
      future: 0,
      group: 'typing',
    })

    model = step(model, undone())
    expect(model.document.children[0]?.children[0]?.text).toBe('ab')
    expect(model.editor.selection).toEqual(caret('a', 2))
    expect(RichText.canRedo(model.editor.history)).toBe(true)

    model = step(model, redone())
    expect(model.document.children[0]?.children[0]?.text).toBe('abXYZ')
    expect(model.editor.selection).toEqual(caret('a', 5))
  })

  it('undoes a discrete command on its own, after the typing burst', () => {
    let model = start(caret('a', 2))
    model = step(model, typed('X'))
    model = step(model, pressed('Entered'))
    expect(model.document.children).toHaveLength(3)

    model = step(model, undone())
    expect(model.document.children.map(block => block.id)).toEqual(['p', 'q'])
    expect(model.document.children[0]?.children[0]?.text).toBe('abX')
    model = step(model, undone())
    expect(model.document.children[0]?.children[0]?.text).toBe('ab')
  })

  it('refuses to undo or redo when there is nothing to do', () => {
    const before = start(caret('a', 2))
    expect(step(before, undone())).toEqual(before)
    expect(RichText.canUndo(before.editor.history)).toBe(false)
  })

  it('keeps redo through a selection change, and adds no undo step for one', () => {
    let model = start(caret('a', 2))
    model = step(model, typed('X'))
    expect(RichText.inspectHistory(model.editor.history)).toEqual({
      past: 1,
      future: 0,
      group: 'typing',
    })
    model = step(model, undone())
    expect(RichText.canRedo(model.editor.history)).toBe(true)

    // Moving the caret is not an edit: redo survives and no step is added.
    model = step(model, selected(caret('a', 1)))
    expect(RichText.canRedo(model.editor.history)).toBe(true)
    expect(RichText.inspectHistory(model.editor.history).past).toBe(0)

    model = step(model, redone())
    expect(model.document.children[0]?.children[0]?.text).toBe('abX')
  })

  it('reports the whole document as replaced so the DOM cannot keep stale nodes', () => {
    const before = start(caret('a', 2))
    const typedOnce = step(before, pressed('Entered'))
    const back = step(typedOnce, undone())
    expect(back.document.children.map(block => block.id)).toEqual(['p', 'q'])

    // The undone block is gone, so the replace patch must name it as removed
    // and name every surviving identity as dirty.
    const changeSet = replaceChangeSet(typedOnce.document, back.document)
    const removedBlock = typedOnce.document.children[1]!.id
    const removedRun = typedOnce.document.children[1]!.children[0]!.id
    expect(changeSet.removedNodes).toEqual(new Set([removedBlock, removedRun]))
    expect([...changeSet.dirtyNodes].sort()).toEqual(['a', 'b', 'p', 'q'])
    expect(changeSet.insertedNodes).toEqual(new Set())
    expect(changeSet.structureChanged).toBe(true)
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
      editor: {
        selection: caret('a', 1),
        nextId: before.editor.nextId,
        history: RichText.emptyHistory,
        storedMarks: null,
        hostId: before.editor.hostId,
      },
    }
    const after = step(replaced, typed('!'))
    expect(after.document.children[0]?.children[0]?.text).toBe('Z!')
    expect(after.editor.selection).toEqual(caret('a', 2))
  })
})

describe('stored marks', () => {
  const runs = (model: Model) =>
    model.document.children[0]?.children.map(run => [run.text, run.marks] as const)

  it('stores a mark toggled with nothing selected, without touching the document', () => {
    const before = start(caret('a', 1))
    const after = step(before, toggled('Bold'))
    expect(after.editor.storedMarks).toEqual(['Bold'])
    expect(after.document).toBe(before.document)
    // A format toggle is not an edit: it adds nothing to undo.
    expect(RichText.inspectHistory(after.editor.history).past).toBe(0)
  })

  it('lands the next typed text with the stored marks', () => {
    let model = start(caret('a', 1))
    model = step(model, toggled('Bold'))
    model = step(model, typed('X'))
    expect(runs(model)).toEqual([
      ['a', []],
      ['X', ['Bold']],
      ['b', []],
    ])
    // The stored set survives typing, so the next character continues it.
    expect(model.editor.storedMarks).toEqual(['Bold'])
  })

  it('unstores a mark toggled a second time', () => {
    let model = start(caret('a', 1))
    model = step(model, toggled('Bold'))
    model = step(model, toggled('Bold'))
    expect(model.editor.storedMarks).toEqual([])
    model = step(model, typed('X'))
    expect(runs(model)).toEqual([['aXb', []]])
  })

  it('types without a mark after toggling it off beside marked text', () => {
    let model = start(caret('a', 2))
    expect(model.editor.storedMarks).toBeNull()
    model = step(model, toggled('Bold'))
    model = step(model, typed('X'))
    expect(runs(model)).toEqual([
      ['ab', []],
      ['X', ['Bold']],
    ])
    model = step(model, toggled('Bold'))
    expect(model.editor.storedMarks).toEqual([])
    model = step(model, typed('Y'))
    expect(runs(model)).toEqual([
      ['ab', []],
      ['X', ['Bold']],
      ['Y', []],
    ])
    expect(model.editor.selection).toEqual(caret(model.document.children[0]!.children[2]!.id, 1))
    expect(RichText.inspectHistory(model.editor.history).past).toBe(1)
  })

  it('drops the stored marks when the caret moves', () => {
    let model = start(caret('a', 1))
    model = step(model, toggled('Bold'))
    model = step(model, selected(caret('a', 0)))
    expect(model.editor.storedMarks).toBeNull()
    model = step(model, typed('X'))
    expect(runs(model)).toEqual([['Xab', []]])
  })

  it('inherits marks again after moving the caret', () => {
    let model = start(caret('a', 1))
    model = step(model, toggled('Italic'))
    model = step(model, selected(caret('b', 2)))
    expect(model.editor.storedMarks).toBeNull()
    model = step(model, typed('X'))
    expect(model.document.children[1]?.children.map(run => [run.text, run.marks])).toEqual([
      ['cdX', ['Bold']],
    ])
  })

  it('leaves a range toggle to the document, not the caret', () => {
    let model = start(range(['a', 0], ['a', 2]))
    model = step(model, toggled('Italic'))
    expect(model.editor.storedMarks).toBeNull()
    expect(runs(model)).toEqual([['ab', ['Italic']]])
  })

  it('refuses a mark the vocabulary does not define, at the toggle itself', () => {
    const before = start(caret('a', 1))
    const after = step(before, toggled('Link'))
    // Nothing is stored and nothing is typed, so the document and caret hold.
    expect(after).toEqual(before)
    expect(after.document).toBe(before.document)
  })
})

describe('the patch acknowledgement', () => {
  it('settles without another command or a change', () => {
    const before = start(caret('a', 2))
    const after = update(before, patched())
    expect(after.model).toEqual(before)
    expect(after.commands ?? []).toEqual([])
  })

  it('renders an undo too, which replaces the document wholesale', () => {
    const after = update(step(start(caret('a', 2)), typed('!')), undone())
    expect(after.commands?.[0]?.name).toBe('RichText.patch')
  })
})
