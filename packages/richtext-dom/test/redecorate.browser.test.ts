/**
 * `Attachment.redecorate` in a real browser: a decoration refresh (another person's caret) puts
 * the editor's selection back, and so must not pull the focus from a control the user moved to.
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

const content = RichText.decodeDocument({
  version: 1,
  children: [
    {
      type: 'Paragraph',
      id: 'p',
      children: [{ type: 'Text', id: 't', text: 'Milk', marks: [] }],
    },
  ],
})

const setup = () => {
  const button = document.createElement('button')
  const dom = mount(document, content)
  document.body.append(dom.root, button)
  const attachment = attach(dom, { onIntent: () => {} })
  attachment.focus(caret('t', 2))
  return { button, dom, attachment }
}

afterEach(() => {
  document.body.replaceChildren()
})

it('leaves the focus on a control the user moved to', () => {
  const { button, attachment } = setup()
  button.focus()
  attachment.redecorate()
  expect(document.activeElement).toBe(button)
})

it('puts the selection back while the editor is the one focused', () => {
  const { dom, attachment } = setup()
  attachment.redecorate()
  expect(document.activeElement).toBe(dom.root)
  expect(readSelection(dom)).toMatchObject({ anchor: { node: 't', offset: 2 } })
})
