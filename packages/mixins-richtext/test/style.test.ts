// @vitest-environment jsdom
/**
 * The block style picker: which style is pressed for a selection, what a button sends, and
 * that it offers nothing where a retype would be refused.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { blockStyles } from '../src/index.js'

const Message = defineMessageUnion({ Sent: { editor: Schema.String } })
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
    { type: 'Heading', id: 'h5', level: 5, children: [text('h5-t')] },
    { type: 'Node', kind: 'CodeBlock', id: 'c', props: {}, children: [text('c-t')] },
  ],
})

interface Model {
  readonly selection: RichText.Selection | null
  readonly sent: string
}

const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: { ...model, sent: message.editor },
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      blockStyles<Message>()(
        {
          document,
          selection: model.selection,
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
    ],
  )

const button = (style: string) => Scene.selector(`[data-style="${style}"]`)

describe('the block style picker', () => {
  it('presses the caret’s style and retypes the block to the one clicked', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: caret('h2-t'), sent: '' }),
      Scene.expect(button('heading-2')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(button('paragraph')).toHaveAttr('aria-pressed', 'false'),
      // A list, a quote, a code block, or a mark is not a style a retype gives.
      Scene.expect(button('bulleted-list')).toBeAbsent(),
      Scene.expect(button('quote')).toBeAbsent(),
      Scene.expect(button('code-block')).toBeAbsent(),
      Scene.expect(button('bold')).toBeAbsent(),
      Scene.click('[data-style="heading-1"]'),
      Scene.expect(Scene.selector('#sent')).toHaveText(
        JSON.stringify({ _tag: 'RetypedBlock', block: { type: 'Heading', level: 1 } }),
      ),
    )
  })

  it('presses none at a heading level it does not offer, and still retypes', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection: caret('h5-t'), sent: '' }),
      Scene.expect(button('heading-2')).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(button('paragraph')).toHaveAttr('aria-pressed', 'false'),
      Scene.click('[data-style="paragraph"]'),
      Scene.expect(Scene.selector('#sent')).toHaveText(
        JSON.stringify({ _tag: 'RetypedBlock', block: { type: 'Paragraph' } }),
      ),
    )
  })

  it.each<[string, RichText.Selection | null]>([
    ['a code block', caret('c-t')],
    ['no selection', null],
  ])('offers nothing in %s, where a retype is refused', (_, selection) => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ selection, sent: '' }),
      Scene.expect(button('paragraph')).toBeDisabled(),
      Scene.expect(button('heading-1')).toBeDisabled(),
    )
  })
})
