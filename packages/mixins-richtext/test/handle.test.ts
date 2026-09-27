// @vitest-environment jsdom
/** The block handle: what up and down send for a block, and where each has nowhere to go. */
import { Effect, Fiber, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import * as RichText from 'foldkit-richtext'
import * as Mount from 'foldkit/mount'
import * as Runtime from 'foldkit/runtime'
import { attachEditor } from 'foldkit-richtext-dom/editor'
import { releaseMount } from 'foldkit-richtext-dom/host'
import { describe, expect, it, vi } from 'vitest'
import { dragMount } from '../src/handle.js'
import { SlotView } from 'foldkit-mixins'
import { blockHandle } from '../src/index.js'

const Message = defineMessageUnion({
  Sent: { editor: Schema.String },
  Pointed: { node: Schema.String },
})
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
  model:
    message._tag === 'Pointed'
      ? { ...model, node: message.node }
      : { ...model, sent: message.editor },
})

const view = (model: Model, h: HtmlBuilder<Message>) =>
  h.div(
    [],
    [
      blockHandle<Message>()(
        {
          document,
          hostId: 'host',
          node: RichText.NodeId.make(model.node),
          wrap: editor => Message.Sent({ editor: JSON.stringify(editor) }),
        },
        h,
      ),
      h.p([h.Id('sent')], [model.sent]),
      h.button([h.Id('point-a'), h.OnClick(Message.Pointed({ node: 'a' }))], ['a']),
    ],
  )

const up = '[data-handle="up"]'
const down = '[data-handle="down"]'
const sent = Scene.selector('#sent')
const moved = (node: string, to: object) => JSON.stringify({ _tag: 'MovedBlock', node, to })
/** The grip's drag Mount for `node`, resolved as a drop would: the application's Message. */
const grip = (node: string) =>
  Scene.Mount.resolve(
    { name: 'RichTextBlockDrag', args: { hostId: 'host', node } },
    Message.Sent({ editor: 'dropped' }),
  )

describe('the block handle', () => {
  it('moves a block before its previous sibling, or after its next', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node: 'b', sent: '' }),
      grip('b'),
      Scene.expect(sent).toHaveText('dropped'),
      Scene.click(up),
      Scene.expect(sent).toHaveText(moved('b', { before: 'a' })),
      Scene.click(down),
      Scene.expect(sent).toHaveText(moved('b', { after: 'l' })),
    )
  })

  it('keeps the grip out of the tab order, since the keyboard has up and down', () => {
    interface Node {
      readonly data?: {
        readonly attrs?: Record<string, unknown>
        readonly props?: Record<string, unknown>
      }
      readonly children?: ReadonlyArray<Node>
    }
    const find = (node: Node): Node | undefined =>
      node.data?.attrs?.['data-handle'] === 'grip'
        ? node
        : (node.children ?? []).map(find).find(found => found !== undefined)
    const drawn = blockHandle<Message>()(
      {
        document,
        hostId: 'host',
        node: RichText.NodeId.make('b'),
        wrap: () => Message.Sent({ editor: '' }),
      },
      SlotView.inertBuilder(),
    ) as unknown as Node
    // Foldkit sets `Tabindex` as the `tabIndex` property.
    expect(find(drawn)?.data?.props?.['tabIndex']).toBe(-1)
  })

  it('moves an item among its own container’s items', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node: 'i2', sent: '' }),
      grip('i2'),
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
      grip(node),
      Scene.expect(Scene.selector(button)).toBeDisabled(),
    )
  })

  it('offers no move for a block that is not there', () => {
    Scene.scene(
      { update, view },
      Scene.given<Model>({ node: 'x', sent: '' }),
      grip('x'),
      Scene.expect(Scene.selector(up)).toBeDisabled(),
      Scene.expect(Scene.selector(down)).toBeDisabled(),
    )
  })

  it('drags through the grip into the caller’s Message', async () => {
    window.document.body.innerHTML = '<div id="host"></div><button id="grip"></button>'
    const host = window.document.getElementById('host')!
    attachEditor(host, document, () => {})
    const boxes: Record<string, number> = { a: 0, b: 30, l: 60 }
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const top = boxes[this.getAttribute('data-block') ?? ''] ?? 0
      return { top, bottom: top + 20, left: 0, width: 100 } as DOMRect
    })
    const gripElement = window.document.getElementById('grip')!
    const action = dragMount('host', RichText.NodeId.make('a'), editor =>
      Message.Sent({ editor: JSON.stringify(editor) }),
    )
    const first = Effect.runFork(Stream.runHead(action.f(gripElement, Mount.liveViewStateChanges)))
    // The fiber starts listening on its own turn; the press has to come after.
    await new Promise(resolve => setTimeout(resolve, 0))
    gripElement.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    window.document.dispatchEvent(new MouseEvent('pointermove', { clientY: 75 }))
    window.document.dispatchEvent(new MouseEvent('pointerup'))
    expect(await Effect.runPromise(Fiber.join(first))).toEqual(
      Option.some(Message.Sent({ editor: moved('a', { after: 'l' }) })),
    )
    spy.mockRestore()
    releaseMount(host)
  })

  it('gives each block its own grip on the runtime, since a drag reads its block once', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      setTimeout(() => callback(performance.now()), 0),
    )
    vi.stubGlobal('cancelAnimationFrame', clearTimeout)
    window.document.body.innerHTML = '<div id="host"></div><div id="handle-runtime"></div>'
    const host = window.document.getElementById('host')!
    attachEditor(host, document, () => {})
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const top = { a: 0, b: 30, l: 60 }[this.getAttribute('data-block') ?? ''] ?? 0
      return { top, bottom: top + 20, left: 0, width: 100 } as DOMRect
    })
    const handle = Runtime.embed(
      Runtime.makeElement({
        Model: Schema.Struct({ node: Schema.String, sent: Schema.String }),
        container: window.document.getElementById('handle-runtime')!,
        init: () => ({ model: { node: 'b', sent: '' } }),
        update,
        view,
      }),
    )
    try {
      const grip = () => window.document.querySelector<HTMLElement>('[data-handle="grip"]')!
      await vi.waitFor(() => expect(grip()).not.toBeNull())
      ;(window.document.getElementById('point-a') as HTMLElement).click()
      await vi.waitFor(() =>
        expect(window.document.querySelector('[data-handle="up"]')?.hasAttribute('disabled')).toBe(
          true,
        ),
      )
      // Past the list's middle: the grip now stands for `a`, so the drop moves `a`.
      await new Promise(resolve => setTimeout(resolve, 0))
      grip().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
      window.document.dispatchEvent(new MouseEvent('pointermove', { clientY: 75 }))
      window.document.dispatchEvent(new MouseEvent('pointerup'))
      await vi.waitFor(() =>
        expect(window.document.getElementById('sent')?.textContent).toBe(
          moved('a', { after: 'l' }),
        ),
      )
    } finally {
      handle.dispose()
      spy.mockRestore()
      releaseMount(host)
      vi.unstubAllGlobals()
    }
  })
})
