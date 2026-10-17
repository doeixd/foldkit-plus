/**
 * Resizable as a transition and as markup: a drag follows the pointer from
 * where it began over the measured group, keys step within the bounds, a
 * collapsible panel collapses and comes back where it was, and the handle
 * is a separator with its value.
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
  const sceneIn = (
    direction: 'ltr' | 'rtl',
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
              direction,
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
  const scene = (
    orientation: 'horizontal' | 'vertical',
    share: number,
    ...steps: ReadonlyArray<Step>
  ) => sceneIn('ltr', orientation, share, ...steps)
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

  // Right to left the first panel is on the right: the handle moving left grows it.
  it.each([
    ['ArrowLeft', 55],
    ['ArrowRight', 45],
  ] as const)('right to left, %s goes to %i%', (key, percent) => {
    sceneIn('rtl', 'horizontal', 0.5, Scene.keydown(handle, key), at(percent))
  })

  it('right to left, a vertical split keeps its arrows', () => {
    sceneIn('rtl', 'vertical', 0.5, Scene.keydown(handle, 'ArrowDown'), at(55))
  })
})

describe('Resizable collapse', () => {
  const first = { collapsible: 'first' as const, min: 0.2 }

  it('collapses the first panel to nothing, and puts it back where it was', () => {
    const collapsed = update(init(0.35), Message.Toggled(), first)
    expect(collapsed.share).toBe(0)
    const back = update(collapsed, Message.Toggled(), first)
    expect(back.share).toBe(0.35)
    expect(back.restore).toEqual(init().restore)
  })

  it('collapses the second panel toward the end, keeping what it is told to', () => {
    const bounds = { collapsible: 'second' as const, collapsedTo: 0.1 }
    expect(update(init(0.4), Message.Toggled(), bounds).share).toBe(0.9)
    expect(
      update(init(0.4), Message.Toggled(), { collapsible: 'first', collapsedTo: 0.05 }).share,
    ).toBe(0.05)
  })

  it('does nothing when no panel collapses', () => {
    const model = init(0.4)
    expect(update(model, Message.Toggled())).toBe(model)
  })

  it('forgets where to go back to once a key or a drag moves the handle', () => {
    const collapsed = update(init(0.35), Message.Toggled(), first)
    const stepped = update(collapsed, Message.Set({ share: 0.05 }), first)
    expect(stepped.share).toBe(0.2)
    expect(update(stepped, Message.Toggled(), first).share).toBe(0)
    let dragged = update(collapsed, Message.Measured({ size: 500 }), first)
    dragged = update(
      update(dragged, Message.DragStarted(), first),
      Message.Dragged({ delta: 200 }),
      first,
    )
    expect(dragged.share).toBe(0.4)
    expect(update(dragged, Message.Toggled(), first).share).toBe(0)
  })

  it('a key at the bound changes nothing, collapsed or not', () => {
    const model = init(0.2)
    expect(update(model, Message.Set({ share: 0 }), first)).toBe(model)
    // Collapsed, the same key opens the panel to its least.
    const opened = update(update(model, Message.Toggled(), first), Message.Set({ share: 0 }), first)
    expect(opened.share).toBe(0.2)
    expect(opened.restore).toEqual(init().restore)
  })
})

describe('Resizable collapse keys', () => {
  const scene = (
    collapsible: 'first' | undefined,
    ...steps: ReadonlyArray<Parameters<typeof Scene.scene<Resizable.Model, Resizable.Message>>[1]>
  ) =>
    Scene.scene<Resizable.Model, Resizable.Message>(
      {
        update: (model, message) => ({ model: update(model, message, { collapsible }) }),
        view: (model, h) =>
          Resizable.view(
            {
              model,
              onMessage: message => message,
              collapsible,
              label: 'Resize the list',
              first: h.p([], ['one']),
              second: h.p([], ['two']),
            },
            h,
          ),
      },
      Scene.given(init(0.4)),
      Scene.Mount.resolveAll(
        [Resize, Message.Measured({ size: 600 })],
        [Move, Message.DragEnded()],
      ),
      ...steps,
    )
  const handle = Scene.role('separator')

  it('Enter collapses and puts back; the collapsed panel is marked', () => {
    scene(
      'first',
      Scene.keydown(handle, 'Enter'),
      Scene.expect(handle).toHaveAttr('aria-valuenow', '0'),
      // The first panel is the one marked.
      Scene.expect(Scene.selector('[data-collapsed]')).toHaveText('one'),
      Scene.keydown(handle, 'Enter'),
      Scene.expect(handle).toHaveAttr('aria-valuenow', '40'),
      Scene.expect(Scene.selector('[data-collapsed]')).toBeAbsent(),
    )
  })

  it('a double-click collapses', () => {
    scene('first', Scene.doubleClick(handle), Scene.expect(handle).toHaveAttr('aria-valuenow', '0'))
  })

  it('reaches down to the collapsed share, for a screen reader', () => {
    scene('first', Scene.expect(handle).toHaveAttr('aria-valuemin', '0'))
    scene(undefined, Scene.expect(handle).toHaveAttr('aria-valuemin', '10'))
  })

  it('leaves Enter alone when nothing collapses', () => {
    scene(undefined, Scene.keydown(handle, 'Enter'), Scene.expectIgnored())
  })
})

describe('Resizable grip', () => {
  it('draws a grip in the handle, hidden from a screen reader', () => {
    const drawn = Resizable.view(
      {
        model: init(0.5),
        onMessage: () => message('Other'),
        label: 'Resize',
        first: h.p([], ['one']),
        second: h.p([], ['two']),
      },
      h,
    )
    const [handle] = Inert.all(drawn).filter(node => Inert.value(node, 'role') === 'separator')
    const [grip] = Inert.children(handle)
    expect(Inert.value(grip, 'aria-hidden')).toBe('true')
  })
})
