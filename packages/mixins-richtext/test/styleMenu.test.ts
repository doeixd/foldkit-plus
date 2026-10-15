// @vitest-environment jsdom
/**
 * The block style menu: the trigger names the caret's style, the open menu checks it, and a
 * choice retypes the block through the caller's wrapper.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { blockStyleMenu } from '../src/index.js'

const Message = defineMessageUnion({ Toggled: {}, Sent: { editor: Schema.String } })
type Message = typeof Message.Type

const id = RichText.NodeId.make
const caret = (node: string): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset: 0, affinity: 'after' },
  focus: { node: id(node), offset: 0, affinity: 'after' },
})
const text = (run: string) => ({ type: 'Text', id: run, text: 'x', marks: [] })
const document = RichText.decodeDocument({
  version: 1,
  children: [
    { type: 'Heading', id: 'h2', level: 2, children: [text('h2-t')] },
    { type: 'Node', kind: 'CodeBlock', id: 'c', props: {}, children: [text('c-t')] },
  ],
})

interface Model {
  readonly selection: RichText.Selection | null
  readonly open: boolean
  readonly sent: string
}
const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, {
    Toggled: () => ({ ...model, open: !model.open }),
    Sent: ({ editor }) => ({ ...model, open: false, sent: editor }),
  }),
})
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      blockStyleMenu<Message>()(
        {
          document,
          selection: model.selection,
          open: model.open,
          toggled: Message.Toggled(),
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
    ],
  )
const given = (selection: RichText.Selection | null) =>
  Scene.given<Model>({ selection, open: false, sent: '' })
const trigger = Scene.selector('[aria-haspopup="menu"]')
const item = (style: string) => Scene.selector(`[data-style="${style}"]`)

describe('the block style menu', () => {
  it('names the caret’s style, checks it when open, and retypes to the one chosen', () => {
    Scene.scene(
      { update, view },
      given(caret('h2-t')),
      Scene.expect(trigger).toHaveText('Heading 2'),
      Scene.expect(trigger).toHaveAttr('aria-expanded', 'false'),
      Scene.expect(item('paragraph')).toBeAbsent(),
      Scene.click(trigger),
      Scene.expect(trigger).toHaveAttr('aria-expanded', 'true'),
      Scene.expect(item('heading-2')).toHaveAttr('aria-checked', 'true'),
      Scene.expect(item('paragraph')).toHaveAttr('aria-checked', 'false'),
      Scene.click(item('paragraph')),
      Scene.expect(Scene.selector('#sent')).toHaveText(
        JSON.stringify({ _tag: 'RetypedBlock', block: { type: 'Paragraph' } }),
      ),
      Scene.expect(item('paragraph')).toBeAbsent(),
    )
  })

  it('says no style where none applies, and opens nothing without a selection', () => {
    Scene.scene(
      { update, view },
      given(caret('c-t')),
      Scene.expect(trigger).toHaveText('Text style'),
    )
    Scene.scene(
      { update, view },
      // Left open as the selection went: the menu shows nothing to choose.
      Scene.given<Model>({ selection: null, open: true, sent: '' }),
      Scene.expect(trigger).toBeDisabled(),
      Scene.expect(trigger).toHaveAttr('aria-expanded', 'false'),
      Scene.expect(item('paragraph')).toBeAbsent(),
    )
  })
})
