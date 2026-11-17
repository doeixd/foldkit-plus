/**
 * `Attachment.sync` in a real browser: a content redraw (another person's edit, an undo from a
 * toolbar) puts the editor's selection back only while the editor is where the user is, so it
 * does not pull the focus from a control the user moved to, and the selection is back when the
 * focus returns through `focus`.
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

/** Another person types at the end: a content change the editor draws. */
const remoteEdit = (document: RichText.Document) => {
  const result = RichText.run(
    { document, selection: caret('t', 4) },
    { type: 'InsertText', text: '!' },
    { mint: () => 'remote' },
  )
  if (!result.ok) throw new Error(result.error)
  return result
}

afterEach(() => {
  document.body.replaceChildren()
})

it('leaves the focus on a control the user moved to while another person’s edit is drawn', () => {
  const { button, attachment } = setup()
  button.focus()
  const remote = remoteEdit(attachment.current().content)
  attachment.sync({ document: remote.state.document, selection: caret('t', 2) }, remote.changeSet)
  expect(document.activeElement).toBe(button)
})

it('puts the selection back when the focus returns', () => {
  const { button, dom, attachment } = setup()
  button.focus()
  const remote = remoteEdit(attachment.current().content)
  const selection = caret('t', 2)
  attachment.sync({ document: remote.state.document, selection }, remote.changeSet)
  attachment.focus(selection)
  expect(document.activeElement).toBe(dom.root)
  expect(readSelection(attachment.current())).toMatchObject({
    anchor: { node: 't', offset: 2 },
  })
})

it('puts the selection back while the editor is the one focused', () => {
  const { dom, attachment } = setup()
  const remote = remoteEdit(attachment.current().content)
  attachment.sync({ document: remote.state.document, selection: caret('t', 3) }, remote.changeSet)
  expect(document.activeElement).toBe(dom.root)
  expect(readSelection(attachment.current())).toMatchObject({ anchor: { node: 't', offset: 3 } })
})
