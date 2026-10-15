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
