/**
 * The controlled-Bundle proof (§27). Each case drives one parent transition and
 * asserts what that single step committed, or deliberately did not.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import {
  application,
  editorAt,
  patched,
  pressed,
  redone,
  replaceChangeSet,
  retyped,
  selected,
  toggled,
  typed,
  undone,
  update,
  type Model,
  type ParentMessage,
} from '../src/editor-bundle.js'
import { placeInputRules, renderingFor } from '../src/host.js'

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
      'menuIndex',
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

  it('retypes the caret’s block, returning a patch for the element it changes', () => {
    const before = start(caret('b', 1))
    const after = update(before, retyped({ type: 'Heading', level: 2 }))
    expect(after.model.document.children[1]).toMatchObject({ type: 'Heading', level: 2 })
    expect(after.model.document.children[0]?.type).toBe('Paragraph')
    // The runs and the caret survive, and the Command carries the element change to
    // the adapter, which re-renders the block as an `h2` rather than keeping a `p`.
    expect(after.model.document.children[1]?.children[0]?.id).toBe('b')
    expect(after.model.editor.selection).toEqual(caret('b', 1))
    expect(after.commands?.[0]?.name).toBe('RichText.patch')
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
        menuIndex: 0,
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

describe('Enter in a live slash query (§123)', () => {
  /** One paragraph holding `text`, with the caret after it. */
  const asked = (text: string): Model => {
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        { type: 'Paragraph', id: 'p', children: [{ type: 'Text', id: 'a', text, marks: [] }] },
      ],
    })
    const model = application.initial({ document }).model
    return { ...model, editor: { ...model.editor, selection: caret('a', text.length) } }
  }
  const highlighted = (model: Model, index: number): Model => ({
    ...model,
    editor: { ...model.editor, menuIndex: index },
  })

  it('chooses the highlighted entry and removes the query, in one transition', () => {
    const after = step(asked('/h2'), pressed('Entered'))
    // No split: the one block became the heading the menu pointed at, its identity and
    // run survived, and the typed query is gone — the deletion and the retype are one
    // action (§124 §5), so the caret lands where the query began.
    expect(after.document.children).toHaveLength(1)
    expect(after.document.children[0]).toMatchObject({ type: 'Heading', level: 2 })
    expect(after.document.children[0]?.children[0]?.text).toBe('')
    expect(after.editor.selection).toMatchObject({
      type: 'Range',
      anchor: { node: 'a', offset: 0 },
    })
  })

  it('undoes a choice as one step, restoring the block and the query', () => {
    const chosen = step(asked('/h2'), pressed('Entered'))
    expect(RichText.inspectHistory(chosen.editor.history).past).toBe(1)
    const back = step(chosen, undone())
    expect(back.document.children[0]).toMatchObject({ type: 'Paragraph' })
    expect(back.document.children[0]?.children[0]?.text).toBe('/h2')
  })

  it('takes the index the application moved, not the first match', () => {
    const after = step(highlighted(asked('/head'), 1), pressed('Entered'))
    expect(after.document.children[0]).toMatchObject({ type: 'Heading', level: 2 })
  })

  it('falls back to the first match when the remembered index is past the matches', () => {
    const after = step(highlighted(asked('/h1'), 5), pressed('Entered'))
    expect(after.document.children[0]).toMatchObject({ type: 'Heading', level: 1 })
  })

  it('updates the caret’s stored marks and removes the query for a mark entry', () => {
    const before = asked('/bold')
    const after = step(before, pressed('Entered'))
    // The entry is a toggle, so the entry itself edits nothing — but the query is
    // removed, and the caret keeps the format for the next typed character. Treating the
    // entry as the Message a click sends is what routes it through the stored-mark path.
    expect(after.editor.storedMarks).toEqual(['Bold'])
    expect(after.document.children).toHaveLength(1)
    expect(after.document.children[0]?.children[0]?.text).toBe('')
  })

  it('splits when the query matches nothing, because nothing is chosen', () => {
    const after = step(asked('/zzz'), pressed('Entered'))
    expect(after.document.children).toHaveLength(2)
    expect(after.document.children[0]?.children[0]?.text).toBe('/zzz')
  })

  it('splits when the text before the caret is not a query', () => {
    const after = step(asked('plain text'), pressed('Entered'))
    expect(after.document.children).toHaveLength(2)
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

describe('placing a renderer with the Bundle (§122)', () => {
  it('records the registry a placement supplies for its own host id', () => {
    const registry = RichText.rendering({ marks: { Link: { tag: 'a', attributes: {} } } })
    editorAt('editor-with-renderer', registry)
    expect(renderingFor('editor-with-renderer')).toBe(registry)
    // A placement without a registry leaves the default, and ids are independent.
    editorAt('editor-without-renderer')
    expect(renderingFor('editor-without-renderer')).toBe(RichText.noRendering)
    expect(renderingFor('editor-never-placed')).toBe(RichText.noRendering)
  })
})

describe('placing a vocabulary with the Bundle (§125)', () => {
  const CodeBlock = RichText.node('CodeBlock', { children: RichText.textContent, marks: 'none' })

  it('refuses a mark added inside a mark-free kind, in the child transition', () => {
    editorAt('constrained-editor', RichText.noRendering, {
      nodes: RichText.nodeRegistry([CodeBlock, RichText.block('Paragraph')]),
    })
    const document = RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'code',
          props: {},
          children: [{ type: 'Text', id: 'code-t', text: 'const x', marks: [] }],
        },
      ],
    })
    const initial = application.initial({ document }).model
    const constrained: Model = {
      ...initial,
      editor: {
        ...initial.editor,
        hostId: 'constrained-editor',
        selection: range(['code-t', 0], ['code-t', 5]),
      },
    }
    // The kind forbids the mark, so the transition refuses and the document holds.
    expect(update(constrained, toggled('Bold')).model.document).toBe(constrained.document)

    // Control: the same toggle on the same document lands when the placement placed no
    // vocabulary, so it is the placement's declaration that refused it.
    editorAt('unconstrained-editor', RichText.noRendering)
    const free: Model = {
      ...initial,
      editor: { ...constrained.editor, hostId: 'unconstrained-editor' },
    }
    expect(update(free, toggled('Bold')).model.document).not.toBe(free.document)
  })
})

describe('an input rule placed for the editor (§124 §4)', () => {
  // The editor carries no syntax of its own: what a marker means is the placement's rule.
  const heading: RichText.InputRule = {
    name: 'heading-1',
    match: textBefore =>
      textBefore === '# '
        ? { remove: 2, commands: [{ type: 'RetypeBlock', to: { type: 'Heading', level: 1 } }] }
        : undefined,
  }

  it('runs the rule as the marker is completed, in the same transition', () => {
    placeInputRules('rule-editor', [heading])
    const initial = start(caret('a', 0))
    const placed: Model = { ...initial, editor: { ...initial.editor, hostId: 'rule-editor' } }
    // The hash alone is text; the space is what completes the marker.
    const hash = step(placed, typed('#'))
    expect(hash.document.children[0]?.children.map(run => run.text).join('')).toBe('#ab')

    const after = step(hash, typed(' '))
    expect(after.document.children[0]).toMatchObject({ type: 'Heading', level: 1 })
    // The marker is gone and the text that was there is kept, with the caret at its start.
    expect(after.document.children[0]?.children.map(run => run.text).join('')).toBe('ab')
    expect(after.editor.selection).toMatchObject({
      type: 'Range',
      anchor: { node: 'a', offset: 0 },
    })
    // One undo step covers the marker and the change it made.
    expect(RichText.inspectHistory(after.editor.history).past).toBe(1)
  })

  it('leaves the text alone when the placement placed no rule', () => {
    const after = step(step(start(caret('a', 0)), typed('#')), typed(' '))
    expect(after.document.children[0]).toMatchObject({ type: 'Paragraph' })
    expect(after.document.children[0]?.children.map(run => run.text).join('')).toBe('# ab')
  })
})
