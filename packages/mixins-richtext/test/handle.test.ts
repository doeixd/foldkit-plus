// @vitest-environment jsdom
/** The block handle: what up and down send for a block, and where each has nowhere to go. */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { blockHandle } from '../src/index.js'

const Message = defineMessageUnion({ Sent: { editor: Schema.String } })
type Message = typeof Message.Type

const paragraph = (name: string) => ({
  type: 'Paragraph',
  id: name,
  children: [{ type: 'Text', id: `${name}-t`, text: name, marks: [] }],
})
const item = (name: string) => ({
  type: 'Node',
  kind: 'ListItem',
  id: name,
  props: {},
  children: [],
  blocks: [paragraph(`${name}-p`)],
})
const document = RichText.decodeDocument({
  version: 1,
  children: [
    paragraph('a'),
    paragraph('b'),
    {
      type: 'Node',
      kind: 'List',
      id: 'l',
      props: {},
      children: [],
      blocks: [item('i1'), item('i2')],
    },
  ],
} as never)

interface Model {
  readonly node: string
  readonly sent: string
}

const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: { ...model, sent: message.editor },
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      blockHandle<Message>()(
        {
          document,
          node: RichText.NodeId.make(model.node),
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
    ],
  )

const up = '[data-handle="up"]'
const down = '[data-handle="down"]'
const sent = Scene.selector('#sent')
const moved = (node: string, to: object) => JSON.stringify({ _tag: 'MovedBlock', node, to })

describe('the block handle', () => {
  it('moves a block before its previous sibling, or after its next', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node: 'b', sent: '' }),
      Scene.click(up),
      Scene.expect(sent).toHaveText(moved('b', { before: 'a' })),
      Scene.click(down),
      Scene.expect(sent).toHaveText(moved('b', { after: 'l' })),
    )
  })

  it('moves an item among its own container’s items', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node: 'i2', sent: '' }),
      Scene.expect(Scene.selector(down)).toBeDisabled(),
      Scene.click(up),
      Scene.expect(sent).toHaveText(moved('i2', { before: 'i1' })),
    )
  })

  it.each([
    ['first in its container', 'a', up],
    ['last in its container', 'l', down],
    ['first among items', 'i1', up],
  ])('disables the move a block %s cannot make', (_, node, button) => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node, sent: '' }),
      Scene.expect(Scene.selector(button)).toBeDisabled(),
    )
  })

  it('offers no move for a block that is not there', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node: 'x', sent: '' }),
      Scene.expect(Scene.selector(up)).toBeDisabled(),
      Scene.expect(Scene.selector(down)).toBeDisabled(),
    )
  })
})
