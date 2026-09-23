// @vitest-environment jsdom
/**
 * DismissLayer: which layers a press dismisses (above the topmost hit, none
 * when the press is inside the top, all when outside every layer, a trigger
 * counts as inside, opted-out layers stay), Escape takes the topmost that
 * allows it, the document Subscription reads the layers and the path, and
 * the Behavior marks layer and trigger.
 */
import { Effect, Fiber, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { Attributes, Capability, Slot, Slots, SlotView } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { DismissLayer } from '../src/interaction/index.js'
import { takeMessages } from './support.js'

const layer = (id: string, options: Partial<DismissLayer.Layer> = {}): DismissLayer.Layer => ({
  id,
  outside: true,
  escape: true,
  ...options,
})
const stack = [layer('menu'), layer('submenu'), layer('tooltip')]

describe('DismissLayer.toDismiss', () => {
  it('dismisses every layer above the topmost one the press was inside', () => {
    expect(DismissLayer.toDismiss(stack, ['menu'])).toEqual(['submenu', 'tooltip'])
    expect(DismissLayer.toDismiss(stack, ['submenu', 'menu'])).toEqual(['tooltip'])
    expect(DismissLayer.toDismiss(stack, ['tooltip'])).toEqual([])
  })
  it('dismisses all layers when the press was outside every one', () => {
    expect(DismissLayer.toDismiss(stack, [])).toEqual(['menu', 'submenu', 'tooltip'])
  })
  it('leaves a layer that opted out of outside press', () => {
    const kept = [layer('menu'), layer('sticky', { outside: false }), layer('tooltip')]
    expect(DismissLayer.toDismiss(kept, [])).toEqual(['menu', 'tooltip'])
  })
})

const Layers = Bundle.declare(DismissLayer.bundle, 'layers')
const Model = Schema.Struct({ ...Layers.fields, closed: Schema.Array(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Layers.cases })
type Message = typeof Message.Type
const Page = Bundle.parent({ Model, Message })
const onOut: (out: DismissLayer.Dismiss) => (model: Model) => { readonly model: Model } =
  out => model => ({ model: { ...model, closed: [...model.closed, ...out.ids] } })
const placed = Page.at(Layers, { onOut })
const fresh: Model = { layers: { layers: [] }, closed: [] }
const send = (model: Model, message: DismissLayer.Message) =>
  Option.getOrThrow(placed.update(model, Layers.wrapper.make(message))).model

describe('DismissLayer placement', () => {
  it('a press dismisses through onOut and records the layers seen', () => {
    const next = send(fresh, DismissLayer.Message.PressedAt({ layers: stack, inside: ['menu'] }))
    expect(next.closed).toEqual(['submenu', 'tooltip'])
    expect(next.layers.layers).toEqual(stack)
    expect(
      send(fresh, DismissLayer.Message.PressedAt({ layers: stack, inside: ['tooltip'] })).closed,
    ).toEqual([])
  })
  it('Escape dismisses the topmost layer, unless it opted out', () => {
    expect(send(fresh, DismissLayer.Message.PressedEscape({ layers: stack })).closed).toEqual([
      'tooltip',
    ])
    const pinned = [layer('menu'), layer('tooltip', { escape: false })]
    expect(send(fresh, DismissLayer.Message.PressedEscape({ layers: pinned })).closed).toEqual([])
    expect(send(fresh, DismissLayer.Message.PressedEscape({ layers: [] })).closed).toEqual([])
  })
})

describe('DismissLayer document subscription', () => {
  it('reports the open layers in DOM order and the layers on the press path, including a trigger', async () => {
    document.body.innerHTML = `
      <button id="open" ${DismissLayer.TRIGGER_ATTRIBUTE}="menu">open</button>
      <div ${DismissLayer.LAYER_ATTRIBUTE}="menu">
        <div ${DismissLayer.LAYER_ATTRIBUTE}="submenu" data-foldkit-plus-layer-outside="false"><span id="deep">x</span></div>
      </div>
      <p id="elsewhere">outside</p>`
    try {
      const subscriptions = DismissLayer.bundle.subscriptions?.()
      const entry = subscriptions?.['document']
      if (entry === undefined) throw new Error('no document subscription')
      const messages = await Effect.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(
            takeMessages(
              entry.dependenciesToStream({}, () => ({})),
              4,
            ),
          )
          for (let i = 0; i < 50; i++) yield* Effect.yieldNow
          const press = (id: string) =>
            document
              .getElementById(id)!
              .dispatchEvent(new window.Event('pointerdown', { bubbles: true, composed: true }))
          press('deep')
          press('open')
          press('elsewhere')
          document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }))
          return yield* Fiber.join(fiber)
        }),
      )
      const seen = [layer('menu'), layer('submenu', { outside: false })]
      expect(messages).toEqual([
        DismissLayer.Message.PressedAt({ layers: seen, inside: ['submenu', 'menu'] }),
        DismissLayer.Message.PressedAt({ layers: seen, inside: ['menu'] }),
        DismissLayer.Message.PressedAt({ layers: seen, inside: [] }),
        DismissLayer.Message.PressedEscape({ layers: seen }),
      ])
    } finally {
      document.body.innerHTML = ''
    }
  })
})

describe('DismissLayer.behavior', () => {
  const MenuSlots = Slots.define({
    trigger: Slot.make({ capability: Capability.Interactive }),
    panel: Slot.make({ capability: Capability.Container }),
  })
  interface MenuInput extends Model {
    readonly menuId: string
  }
  const h = SlotView.inertBuilder<Message>()
  const Dismissable = DismissLayer.behavior(Layers)(MenuSlots)<MenuInput, Message>({
    layer: 'panel',
    trigger: 'trigger',
    id: input => input.menuId,
    escape: false,
  })
  const input: MenuInput = { ...fresh, menuId: 'menu' }
  const b = SlotView.buildersFor(MenuSlots, [Dismissable.mixin], { input, h })

  it('marks the layer with its id and options, and the trigger with the id', () => {
    const panel = Attributes.filter(b.panel.attrs(), 'Attribute').map(a => [a.key, a.value])
    expect(panel).toEqual([
      [DismissLayer.LAYER_ATTRIBUTE, 'menu'],
      ['data-foldkit-plus-layer-escape', 'false'],
    ])
    const trigger = Attributes.filter(b.trigger.attrs(), 'Attribute').map(a => [a.key, a.value])
    expect(trigger).toEqual([[DismissLayer.TRIGGER_ATTRIBUTE, 'menu']])
  })
})
