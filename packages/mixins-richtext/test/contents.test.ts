// @vitest-environment jsdom
/**
 * The table of contents: one entry per heading with text, its depth relative to the shallowest
 * level used, the section the caret is in marked current, and a choice sent as the caller's.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, it } from 'vitest'
import { tableOfContents } from '../src/index.js'

const Message = defineMessageUnion({ Chose: { node: Schema.String } })
type Message = typeof Message.Type

const heading = (id: string, level: number, text: string) => ({
  type: 'Heading',
  id,
  level,
  children: [{ type: 'Text', id: `${id}-t`, text, marks: [] }],
})
const paragraph = (id: string) => ({
  type: 'Paragraph',
  id,
  children: [{ type: 'Text', id: `${id}-t`, text: 'words', marks: [] }],
})
// The shallowest heading is a level 2, so depths count from it.
const document = RichText.decodeDocument({
  version: 1,
  children: [heading('a', 2, 'First'), paragraph('p'), heading('b', 3, 'Second'), paragraph('q')],
})
const empty = RichText.decodeDocument({ version: 1, children: [paragraph('p')] })

interface Model {
  readonly document: RichText.Document
  readonly caret: string
  readonly chosen: string
}
const update = (model: Model, message: Message): { readonly model: Model } => ({
  model: Message.match(message, { Chose: ({ node }) => ({ ...model, chosen: node }) }),
})
const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      tableOfContents<Message>()(
        {
          document: model.document,
          selection: {
            type: 'Range',
            anchor: { node: RichText.NodeId.make(model.caret), offset: 0, affinity: 'after' },
            focus: { node: RichText.NodeId.make(model.caret), offset: 0, affinity: 'after' },
          },
          chosen: node => Message.Chose({ node }),
        },
        h,
      ),
      h.p([h.Id('chosen')], [model.chosen]),
    ],
  )
const given = (overrides: Partial<Model> = {}) =>
  Scene.given<Model>({ document, caret: 'q-t', chosen: '', ...overrides })
const first = Scene.role('button', { name: 'First' })
const second = Scene.role('button', { name: 'Second' })

describe('the table of contents', () => {
  it('lists the headings, each at its depth, the caret’s section current', () => {
    Scene.scene(
      { update, view },
      given(),
      Scene.expect(first).toHaveText('First'),
      Scene.expect(first).toHaveStyle('--fk-toc-level', '1'),
      Scene.expect(first).not.toHaveAttr('aria-current'),
      Scene.expect(second).toHaveText('Second'),
      Scene.expect(second).toHaveStyle('--fk-toc-level', '2'),
      Scene.expect(second).toHaveAttr('aria-current', 'location'),
    )
  })

  it('marks the first section while the caret is in it', () => {
    Scene.scene(
      { update, view },
      given({ caret: 'p-t' }),
      Scene.expect(first).toHaveAttr('aria-current', 'location'),
      Scene.expect(second).not.toHaveAttr('aria-current'),
    )
  })

  it('sends the chosen heading', () => {
    Scene.scene(
      { update, view },
      given(),
      Scene.click(second),
      Scene.expect(Scene.selector('#chosen')).toHaveText('b'),
    )
  })

  it('draws nothing without headings', () => {
    Scene.scene(
      { update, view },
      given({ document: empty, caret: 'p-t' }),
      Scene.expect(Scene.selector('nav')).not.toExist(),
    )
  })
})
