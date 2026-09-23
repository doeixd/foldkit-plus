import { describe, expect, it } from 'vitest'
import { Scene } from 'foldkit/test'
import * as HoverIntent from '@foldkit/ui/hoverIntent'
import { Style, type MixinValue, type SlotAttributes } from 'foldkit-mixins'
import { HoverIntent as Adapter, HoverIntentSlots } from '../src/index.js'
import { classValue, holds } from './fixture.js'

type Mixins = ReadonlyArray<MixinValue<HoverIntent.Message> | MixinValue<never>>

interface Captured {
  readonly isVisible: boolean
  readonly trigger: SlotAttributes<HoverIntent.Message>
  readonly panel: SlotAttributes<HoverIntent.Message>
  readonly render: HoverIntent.RenderInfo
}

const run = (mixins: Mixins, capture: (captured: Captured) => void): void => {
  Scene.scene(
    {
      update: HoverIntent.update,
      view: (model, h) =>
        HoverIntent.view(
          model,
          {
            toView: render => {
              const resolved = Adapter.resolve(render, mixins, { input: undefined, h })
              capture({
                isVisible: resolved.isVisible,
                trigger: resolved.trigger,
                panel: resolved.panel,
                render,
              })
              return h.div([...resolved.trigger], [])
            },
          },
          h,
        ),
    },
    Scene.given(HoverIntent.init()),
  )
}

describe('HoverIntent adapter', () => {
  it('preserves the real ChildAttribute bundles by identity', () => {
    let captured: Captured | undefined
    run([], value => {
      captured = value
    })
    const view = captured!
    expect(view.isVisible).toBe(false)
    for (const child of view.render.trigger) expect(holds(view.trigger, child)).toBe(true)
    for (const child of view.render.panel) expect(holds(view.panel, child)).toBe(true)
  })

  it('adds a Style to each group without disturbing them', () => {
    const Card = Style.forSlots(HoverIntentSlots)({
      trigger: Style.class('hover-trigger'),
      panel: Style.class('hover-card'),
    })
    let captured: Captured | undefined
    run([Card.mixin], value => {
      captured = value
    })
    expect(classValue(captured!.trigger)).toBe('hover-trigger')
    expect(classValue(captured!.panel)).toBe('hover-card')
    for (const child of captured!.render.panel) expect(holds(captured!.panel, child)).toBe(true)
  })
})
