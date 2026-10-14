/**
 * `Attachment.focus` in a real browser, since jsdom moves no focus and lays nothing out: the
 * editor takes the focus from a field outside it, holds the given selection, and scrolls only
 * when that selection is out of view.
 */
import { afterEach, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, readSelection } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})

// Taller than the window, so the last line starts out of view.
const content = RichText.decodeDocument({
  version: 1,
  children: Array.from({ length: 80 }, (_, index) => ({
    type: 'Paragraph',
    id: `p${index}`,
    children: [{ type: 'Text', id: `t${index}`, text: `Line ${index}`, marks: [] }],
  })),
})

const setup = () => {
  const field = document.createElement('input')
  const dom = mount(document, content)
  document.body.append(field, dom.root)
  field.focus()
  window.scrollTo(0, 0)
  return { field, dom, attachment: attach(dom, { onIntent: () => {} }) }
}

afterEach(() => {
  document.body.replaceChildren()
  window.scrollTo(0, 0)
})

it('takes the focus with the selection, scrolled into view', () => {
  const { dom, attachment } = setup()
  attachment.focus(caret('t79', 3))
  expect(document.activeElement).toBe(dom.root)
  expect(readSelection(dom)).toMatchObject({
    anchor: { node: 't79', offset: 3 },
    focus: { node: 't79', offset: 3 },
  })
  const box = dom.elements.get(id('t79'))!.getBoundingClientRect()
  expect(box.top).toBeGreaterThanOrEqual(0)
  expect(box.bottom).toBeLessThanOrEqual(window.innerHeight)
})

it('does not scroll to a selection already in view', () => {
  const { dom, attachment } = setup()
  // At the top of the window, where centring it would scroll.
  dom.elements.get(id('t40'))!.scrollIntoView({ block: 'start' })
  const scrolled = window.scrollY
  attachment.focus(caret('t40', 2))
  expect(document.activeElement).toBe(dom.root)
  expect(window.scrollY).toBe(scrolled)
})
