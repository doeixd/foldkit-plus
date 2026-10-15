/**
 * Resizable as a transition and as markup: a drag follows the pointer from
 * where it began over the measured group, keys step within the bounds, and
 * the handle is a separator with its value.
 */
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Move } from 'foldkit-primitives/dom'
import { Resize } from 'foldkit-primitives/observers'
import { Patterns, Recipes, Resizable, ResizableSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const { Message, init, update } = Resizable

describe('Resizable.update', () => {
  it('follows a drag from where it began, over the measured group', () => {
    let model = update(init(0.5), Message.Measured({ size: 600 }))
    model = update(model, Message.DragStarted())
    model = update(model, Message.Dragged({ delta: -120 }))
    expect(model.share).toBe(0.3)
    // A later move is measured from the start again, not from the last move.
    model = update(model, Message.Dragged({ delta: 60 }))
    expect(model.share).toBe(0.6)
  })

  it('holds still before the group is measured, and outside a drag', () => {
    const unmeasured = update(
      update(init(0.5), Message.DragStarted()),
      Message.Dragged({ delta: 99 }),
    )
    expect(unmeasured.share).toBe(0.5)
    const idle = update(init(0.5), Message.Dragged({ delta: 99 }))
    expect(idle).toEqual(init(0.5))
  })

  it('keeps a share within its bounds, and returns the same Model when nothing changes', () => {
    expect(update(init(0.5), Message.Set({ share: 2 }), { max: 0.8 }).share).toBe(0.8)
    expect(update(init(0.5), Message.Set({ share: 2 })).share).toBe(0.9)
    expect(update(init(0.5), Message.Set({ share: -1 })).share).toBe(0.1)
    const model = init(0.5)
    expect(update(model, Message.Set({ share: 0.5 }))).toBe(model)
  })

  it('rounds away the float noise of a step', () => {
    // 0.35 + 0.05 is 0.39999999999999997.
    expect(update(init(0.35), Message.Set({ share: 0.35 + 0.05 })).share).toBe(0.4)
  })

  it('moves nothing once a drag has ended', () => {
    let model = update(init(0.5), Message.Measured({ size: 600 }))
    model = update(update(model, Message.DragStarted()), Message.DragEnded())
    expect(update(model, Message.Dragged({ delta: 120 })).share).toBe(0.5)
  })
})

describe('Resizable.view', () => {
  const style = Style.forSlots(ResizableSlots)(Recipes.Resizable({}))

  it('meets the window splitter pattern', () => {
    expect(A11y.validate(Patterns.Resizable, ResizableSlots)).toEqual([])
  })

  it('draws the handle as a separator with its value, a tab stop', () => {
    const drawn = Resizable.view(
      {
        model: init(0.35),
        onMessage: () => message('Other'),
        label: 'Resize the list',
        first: h.p([], ['one']),
        second: h.p([], ['two']),
        style,
      },
      h,
    )
    const [handle] = Inert.all(drawn).filter(node => Inert.value(node, 'role') === 'separator')
    expect(Inert.value(handle, 'aria-valuenow')).toBe('35')
    expect(Inert.value(handle, 'aria-orientation')).toBe('vertical')
    expect(Inert.value(handle, 'tabIndex')).toBe(0)
  })
})

describe('Resizable keys', () => {
  type Step = Parameters<typeof Scene.scene<Resizable.Model, Resizable.Message>>[1]
  const scene = (
    orientation: 'horizontal' | 'vertical',
    share: number,
    ...steps: ReadonlyArray<Step>
  ) =>
    Scene.scene<Resizable.Model, Resizable.Message>(
      {
        update: (model, message) => ({ model: update(model, message, { min: 0.2, max: 0.7 }) }),
        view: (model, h) =>
          Resizable.view(
            {
              model,
              onMessage: message => message,
              orientation,
              min: 0.2,
              max: 0.7,
              label: 'Resize the list',
              first: h.p([], ['one']),
              second: h.p([], ['two']),
            },
            h,
          ),
      },
      Scene.given(init(share)),
      // The group's measure and the handle's drag, which the keys do not need.
      Scene.Mount.resolveAll(
        [Resize, Message.Measured({ size: 600 })],
        [Move, Message.DragEnded()],
      ),
      ...steps,
    )
  const handle = Scene.role('separator')
  const at = (percent: number) => Scene.expect(handle).toHaveAttr('aria-valuenow', String(percent))

  it.each([
    ['horizontal', 'ArrowRight', 55],
    ['horizontal', 'ArrowLeft', 45],
    ['vertical', 'ArrowDown', 55],
    ['vertical', 'ArrowUp', 45],
    ['horizontal', 'Home', 20],
    ['horizontal', 'End', 70],
  ] as const)('a %s split on %s goes to %i%', (orientation, key, percent) => {
    scene(orientation, 0.5, Scene.keydown(handle, key), at(percent))
  })

  it("leaves the other axis's arrows alone", () => {
    scene('vertical', 0.5, Scene.keydown(handle, 'ArrowRight'), Scene.expectIgnored())
  })
})
