// @vitest-environment jsdom
/**
 * The marks toolbar: a button per mark, the active one pressed, and a click
 * dispatching the mark's Message. The view places it beside its other chrome.
 */
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import { describe, expect, it } from 'vitest'
import { marksToolbar, type ToolbarState } from '../src/toolbar.js'

interface Message {
  readonly _tag: 'Toggled'
  readonly mark: string
}
interface Model {
  readonly state: ToolbarState
  readonly last: string
}

const id = RichText.NodeId.make

const caret = (node: string, offset: number): RichText.Selection => ({
  type: 'Range',
  anchor: { node: id(node), offset, affinity: 'after' },
  focus: { node: id(node), offset, affinity: 'after' },
})

const document = () =>
  RichText.decodeDocument({
    version: 1,
    children: [
      {
        type: 'Paragraph',
        id: 'p',
        children: [
          { type: 'Text', id: 'a', text: 'ab', marks: [] },
          { type: 'Text', id: 'b', text: 'cd', marks: ['Bold'] },
        ],
      },
    ],
  })

const model = (
  selection: RichText.Selection | null,
  storedMarks: ReadonlyArray<string> | null,
): Model => ({ state: { document: document(), selection, storedMarks }, last: '' })

const update = (current: Model, message: Message): { readonly model: Model } => ({
  model: { ...current, last: message.mark },
})
const toMessage = (mark: string): Message => ({ _tag: 'Toggled', mark })

const view = (current: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [marksToolbar({ state: current.state, toMessage })(h), h.p([h.Id('last')], [current.last])],
  )

describe('the marks toolbar', () => {
  it('presses the mark the caret carries', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>(model(caret('b', 1), null)),
      Scene.expect(Scene.selector('[data-mark="Bold"]')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('[data-mark="Italic"]')).toHaveAttr('aria-pressed', 'false'),
      Scene.expect(Scene.selector('[data-mark="Code"]')).toHaveAttr('aria-pressed', 'false'),
    )
  })

  it('lets the stored format win over the run under the caret', () => {
    Scene.scene(
      { update, view },
      // The caret sits in the plain run, but the editor says it is typing Italic.
      Scene.given<Model>(model(caret('a', 1), ['Italic'])),
      Scene.expect(Scene.selector('[data-mark="Italic"]')).toHaveAttr('aria-pressed', 'true'),
      Scene.expect(Scene.selector('[data-mark="Bold"]')).toHaveAttr('aria-pressed', 'false'),
    )
  })

  it('dispatches the mark its button names', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>(model(caret('a', 1), null)),
      Scene.click('[data-mark="Italic"]'),
      Scene.expect(Scene.selector('#last')).toHaveText('Italic'),
    )
  })

  it('offers exactly the marks it is given', () => {
    const one = (current: Model, h: HtmlBuilder<Message>) =>
      marksToolbar({ state: current.state, marks: ['Code'], toMessage })(h)
    Scene.scene(
      { update, view: one },
      Scene.given<Model>(model(caret('a', 1), null)),
      Scene.expect(Scene.selector('[data-mark="Code"]')).toExist(),
      Scene.expect(Scene.selector('[data-mark="Bold"]')).toBeAbsent(),
    )
  })
})
