/**
 * ArrowDown and ArrowUp onto an atom, in a real browser, since only the layout says which line
 * of a wrapped paragraph the caret is on: from the line next to the atom they select it, from
 * any other line they are the browser's.
 */
import { afterEach, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})
const words = 'word '.repeat(60).trim()
const paragraph = (block: string) => ({
  type: 'Paragraph',
  id: block,
  children: [{ type: 'Text', id: `${block}-t`, text: words, marks: [] }],
})

const setup = () => {
  const dom = mount(
    document,
    RichText.decodeDocument({
      version: 1,
      children: [
        paragraph('above'),
        { type: 'Node', kind: 'Divider', id: 'rule', props: {}, children: [] },
        paragraph('below'),
      ],
    }),
  )
  // Narrow, so each paragraph wraps onto several lines.
  dom.root.style.width = '200px'
  document.body.append(dom.root)
  const moves: Array<RichText.Selection | null> = []
  const attachment = attach(dom, { onIntent: () => {}, onSelection: move => moves.push(move) })
  dom.root.focus()
  const press = (key: string, at: RichText.Selection) => {
    restoreSelection(dom, at)
    // What the browser reports of the caret moving, before the key.
    document.dispatchEvent(new Event('selectionchange'))
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    dom.root.dispatchEvent(event)
    return event.defaultPrevented
  }
  return { attachment, moves, press }
}

afterEach(() => document.body.replaceChildren())

it('selects the atom from the line beside it, and not from another', () => {
  const { moves, press } = setup()
  // The first word of the paragraph above is on its first line, away from the divider.
  expect(press('ArrowDown', caret('above-t', 2))).toBe(false)
  // Its last word, short of the very end, is on its last line.
  expect(press('ArrowDown', caret('above-t', words.length - 2))).toBe(true)
  expect(press('ArrowUp', caret('below-t', words.length - 2))).toBe(false)
  expect(press('ArrowUp', caret('below-t', 2))).toBe(true)
  expect(moves.filter(move => move?.type === 'Node')).toEqual([
    { type: 'Node', node: 'rule' },
    { type: 'Node', node: 'rule' },
  ])
})
