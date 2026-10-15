// @vitest-environment jsdom
/**
 * Select-all in code: the first selects the code's text, a second is the browser's, over the
 * whole document; outside code it is always the browser's.
 */
import { afterEach, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'
import { attach, readSelection, restoreSelection } from '../src/events.js'
import { mount } from '../src/index.js'

const id = RichText.NodeId.make
const at = (node: string, offset: number) => ({
  node: id(node),
  offset,
  affinity: 'after' as const,
})
const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: at(node, offset),
  focus: at(node, offset),
})

const setup = () => {
  const dom = mount(
    document,
    RichText.decodeDocument({
      version: 1,
      children: [
        {
          type: 'Node',
          kind: 'Note',
          id: 'note',
          props: {},
          children: [{ type: 'Text', id: 'note-t', text: 'Prose', marks: [] }],
        },
        {
          type: 'Node',
          kind: 'CodeBlock',
          id: 'code',
          props: {},
          children: [{ type: 'Text', id: 'code-t', text: 'let x\nlet y', marks: [] }],
        },
      ],
    }),
  )
  document.body.append(dom.root)
  const nodes = RichText.nodeRegistry([...RichText.standardNodes, RichText.node('Note')])
  const attachment = attach(dom, { onIntent: () => {}, nodes })
  const selectAll = (from: RichText.Selection) => {
    restoreSelection(attachment.current(), from)
    const event = new KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    attachment.current().root.dispatchEvent(event)
    return event.defaultPrevented
  }
  return { attachment, selectAll }
}
afterEach(() => document.body.replaceChildren())

it('selects the code first, then leaves select-all to the browser', () => {
  const { attachment, selectAll } = setup()
  expect(selectAll(caret('code-t', 3))).toBe(true)
  const code: RichText.Selection = {
    type: 'Range',
    anchor: at('code-t', 0),
    focus: at('code-t', 11),
  }
  // Affinity is read from the range, not carried by it.
  expect(readSelection(attachment.current())).toMatchObject({
    anchor: { node: 'code-t', offset: 0 },
    focus: { node: 'code-t', offset: 11 },
  })
  expect(selectAll(code)).toBe(false)
})

it('leaves select-all to the browser in a kind whose text keeps no line breaks', () => {
  const { selectAll } = setup()
  expect(selectAll(caret('note-t', 2))).toBe(false)
})
