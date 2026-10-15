// @vitest-environment jsdom
/**
 * An atom (an image, a divider) selected whole: a press on it selects it, the browser is given
 * the range around its element and that range reads back as the same selection, the block is
 * marked, and an arrow leaves it for the text beside it.
 */
import { afterEach, describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, readSelection, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const paragraph = (block: string, text: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text, marks: [] }],
})
const content = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      paragraph('before', 'Before'),
      { type: 'Node', kind: 'Divider', id: 'rule', props: {}, children: [] },
      paragraph('after', 'After'),
    ],
  })
const selected: RichText.Selection = { type: 'Node', node: id('rule') }
const caret = (node: string, offset: number): RichText.Selection => {
  const at = { node: id(node), offset, affinity: 'after' as const }
  return { type: 'Range', anchor: at, focus: at }
}

const where = (selection: RichText.Selection | null) =>
  selection?.type === 'Range' ? [selection.focus.node, selection.focus.offset] : selection

const setup = () => {
  const dom = mount(document, content())
  document.body.append(dom.root)
  const moves: Array<RichText.Selection | null> = []
  const attachment = attach(dom, { onIntent: () => {}, onSelection: move => moves.push(move) })
  const element = (block: string) => attachment.current().elements.get(id(block))!
  return { dom, attachment, moves, element }
}
afterEach(() => document.body.replaceChildren())

const press = (target: Element, button = 0): MouseEvent => {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button })
  target.dispatchEvent(event)
  return event
}

describe('selecting an atom', () => {
  it('selects it on a press, marking it, where a press on text does nothing of the kind', () => {
    const { moves, element } = setup()
    const event = press(element('rule'))
    expect(event.defaultPrevented).toBe(true)
    expect(moves).toEqual([selected])
    expect(element('rule').hasAttribute('data-selected')).toBe(true)
    const onText = press(element('after'))
    expect(onText.defaultPrevented).toBe(false)
    expect(moves).toEqual([selected])
  })

  it('leaves a press with another button to the browser', () => {
    const { moves, element } = setup()
    expect(press(element('rule'), 2).defaultPrevented).toBe(false)
    expect(moves).toEqual([])
  })

  it('reads the range drawn for it back as the same selection', () => {
    const { dom } = setup()
    restoreSelection(dom, selected)
    expect(readSelection(dom)).toEqual(selected)
  })

  it('takes the mark away when the selection moves to text', () => {
    const { attachment, element } = setup()
    press(element('rule'))
    restoreSelection(attachment.current(), caret('after-t', 1))
    document.dispatchEvent(new Event('selectionchange'))
    expect(element('rule').hasAttribute('data-selected')).toBe(false)
  })

  it.each([
    ['ArrowDown', caret('after-t', 0)],
    ['ArrowRight', caret('after-t', 0)],
    ['ArrowUp', caret('before-t', 6)],
    ['ArrowLeft', caret('before-t', 6)],
  ] as const)('leaves it with %s for the text beside it', (key, expected) => {
    const { attachment, moves, element } = setup()
    press(element('rule'))
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    attachment.current().root.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(moves).toEqual([selected, expected])
    // Affinity is read from the range, not carried by it.
    expect(where(readSelection(attachment.current()))).toEqual(where(expected))
  })
})

describe('reaching an atom with an arrow key', () => {
  const arrow = (
    attachment: ReturnType<typeof attach>,
    key: string,
    modifiers: { shiftKey?: boolean } = {},
  ) => {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    attachment.current().root.dispatchEvent(event)
    return event
  }

  it.each([
    ['ArrowRight', caret('before-t', 6)],
    ['ArrowDown', caret('before-t', 6)],
    ['ArrowLeft', caret('after-t', 0)],
    ['ArrowUp', caret('after-t', 0)],
  ] as const)('%s from the edge of the text beside it selects it', (key, from) => {
    const { attachment, moves } = setup()
    restoreSelection(attachment.current(), from)
    expect(arrow(attachment, key).defaultPrevented).toBe(true)
    expect(moves.at(-1)).toEqual(selected)
  })

  it('reads where the caret is, not the last report of it', () => {
    const { attachment, moves, element } = setup()
    press(element('rule'))
    // The caret left the atom for the text after it, and the browser has not said so yet.
    restoreSelection(attachment.current(), caret('after-t', 0))
    arrow(attachment, 'ArrowLeft')
    expect(moves.at(-1)).toEqual(selected)
    expect(readSelection(attachment.current())).toEqual(selected)
  })

  it('leaves an arrow away from the edge, or with Shift, to the browser', () => {
    const { attachment, moves } = setup()
    restoreSelection(attachment.current(), caret('before-t', 3))
    expect(arrow(attachment, 'ArrowRight').defaultPrevented).toBe(false)
    restoreSelection(attachment.current(), caret('before-t', 6))
    expect(arrow(attachment, 'ArrowRight', { shiftKey: true }).defaultPrevented).toBe(false)
    expect(moves).toEqual([])
  })
})

it('keeps the caret where it was on a press on an adornment', () => {
  const dom = mount(
    document,
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Task',
          id: 'task',
          props: {},
          children: [{ type: 'Text', id: 'task-t', text: 'Do it', marks: [] }],
        },
      ],
    }),
    RichText.renderingOver(RichText.standardRendering, {
      nodes: {
        Task: () => ({
          tag: 'div',
          attributes: {},
          adornments: [{ tag: 'input', attributes: { type: 'checkbox' }, toggles: 'done' }],
        }),
      },
    }),
  )
  document.body.append(dom.root)
  attach(dom, { onIntent: () => {} })
  const box = dom.root.querySelector(`[${RichText.TOGGLES_ATTRIBUTE}]`)!
  expect(press(box).defaultPrevented).toBe(true)
})

it('selects a block’s own text on a third press, and not into the next block', () => {
  const { attachment, moves, element } = setup()
  const third = new MouseEvent('mousedown', { bubbles: true, cancelable: true, detail: 3 })
  element('before').dispatchEvent(third)
  expect(third.defaultPrevented).toBe(true)
  const from = { node: id('before-t'), offset: 0, affinity: 'after' }
  const to = { node: id('before-t'), offset: 6, affinity: 'after' }
  expect(moves).toEqual([{ type: 'Range', anchor: from, focus: to }])
  expect(readSelection(attachment.current())).toMatchObject({
    anchor: { offset: 0 },
    focus: { offset: 6 },
  })
})
