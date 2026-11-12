/**
 * The Switch dragged by its thumb, on a real runtime with real pointer input:
 * let go past the middle of the track it turns to that side, a drag that ends
 * where it began changes nothing, a plain click toggles once, a drag is not
 * also a click, right to left mirrors it, and a disabled switch does not move.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Recipes, Switch, SwitchSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(SwitchSlots)(Recipes.Switch({}))
const Model = Schema.Struct({ on: Schema.Boolean, toggles: Schema.Number })
type Model = typeof Model.Type
interface Toggled {
  readonly _tag: 'Toggled'
  readonly isChecked: boolean
}

afterEach(async () => {
  // Somewhere empty, so no switch is left hovered or pressed for the next test.
  await userEvent.hover(document.body, { position: { x: 300, y: 300 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Placing {
  readonly dir?: 'rtl'
  readonly disabled?: boolean
  readonly on?: boolean
  /** An `update` that answers every toggle by leaving the switch as it was. */
  readonly refuse?: boolean
}

const mount = (options: Placing = {}) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    // Still, so a thumb is read where it ends rather than mid-flight.
    ':root{--fk-knob-motion:0}'
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'switch-drag'
  document.body.appendChild(container)
  const onToggle = (isChecked: boolean): Toggled => ({ _tag: 'Toggled', isChecked })
  const view = (model: Model, h: HtmlBuilder<Toggled>) => {
    const s = SlotView.buildersFor(SwitchSlots, [style.mixin, Switch.draggable(onToggle)], {
      input: undefined,
      h,
    })
    return h.div(
      [h.Style({ padding: '40px' }), ...(options.dir === undefined ? [] : [h.Dir(options.dir)])],
      [
        h.button(
          s.button.attrs([
            h.AriaLabel('switch'),
            h.Role('switch'),
            h.AriaChecked(model.on),
            ...(options.disabled === true ? [h.AriaDisabled(true)] : []),
            // What upstream's bundle does for a click and Space.
            ...(options.disabled === true ? [] : [h.OnClick(onToggle(!model.on))]),
          ]),
          [],
        ),
        h.p([h.Id('toggles')], [String(model.toggles)]),
      ],
    )
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { on: options.on === true, toggles: 0 } }),
      update: (model: Model, message: Toggled) =>
        options.refuse === true || message.isChecked === model.on
          ? { model }
          : { model: { on: message.isChecked, toggles: model.toggles + 1 } },
      view,
    }),
  )
}

const control = () => document.querySelector<HTMLElement>('[aria-label="switch"]')!
const toggles = () => document.getElementById('toggles')!.textContent
const checked = () => control().getAttribute('aria-checked')
const drawn = () =>
  vi.waitFor(() => expect(document.querySelector('[aria-label="switch"]')).not.toBeNull())

/** Presses at `from` and lets go at `to`, each as a share of the switch's width. */
const drag = async (from: number, to: number) => {
  const { width, height } = control().getBoundingClientRect()
  await userEvent.dragAndDrop(control(), control(), {
    sourcePosition: { x: width * from, y: height / 2 },
    targetPosition: { x: width * to, y: height / 2 },
  })
}

/** Where the thumb's middle lies on the track, from its start, as a share of the switch. */
const thumbAt = () => {
  const box = control().getBoundingClientRect()
  const thumb = getComputedStyle(control(), '::before')
  const [x] = thumb.translate === 'none' ? ['0'] : thumb.translate.split(' ')
  const middle =
    Number.parseFloat(thumb.insetInlineStart) +
    Number.parseFloat(x ?? '0') +
    Number.parseFloat(thumb.inlineSize) / 2
  return middle / box.width
}

test('a drag past the middle turns it on, and back past the middle turns it off', async () => {
  const handle = mount()
  try {
    await drawn()
    await drag(0.25, 0.95)
    await vi.waitFor(() => expect(checked()).toBe('true'))
    expect(toggles()).toBe('1')
    await drag(0.75, 0.05)
    await vi.waitFor(() => expect(checked()).toBe('false'))
    expect(toggles()).toBe('2')
  } finally {
    handle.dispose()
  }
})

test('a drag that ends on the side it began on changes nothing, and is no click', async () => {
  const handle = mount()
  try {
    await drawn()
    await drag(0.1, 0.25)
    await drag(0.5, 0.1)
    // The click after each release would have turned it on.
    await new Promise(resolve => setTimeout(resolve, 100))
    expect([checked(), toggles()]).toEqual(['false', '0'])
    // And it rests where it began.
    expect(control().hasAttribute('data-dragging')).toBe(false)
    expect(thumbAt()).toBeLessThan(0.4)
  } finally {
    handle.dispose()
  }
})

test('a drag the update refuses lets the thumb go back to where the switch is', async () => {
  const handle = mount({ refuse: true })
  try {
    await drawn()
    await drag(0.25, 0.95)
    await vi.waitFor(() => expect(control().hasAttribute('data-dragging')).toBe(false))
    expect([checked(), toggles()]).toEqual(['false', '0'])
    expect(thumbAt()).toBeLessThan(0.4)
  } finally {
    handle.dispose()
  }
})

test('a plain click toggles exactly once, and so does one after a drag', async () => {
  const handle = mount()
  try {
    await drawn()
    await userEvent.click(control())
    await vi.waitFor(() => expect(checked()).toBe('true'))
    expect(toggles()).toBe('1')
    await drag(0.8, 0.1)
    await vi.waitFor(() => expect(checked()).toBe('false'))
    expect(toggles()).toBe('2')
    await userEvent.click(control())
    await vi.waitFor(() => expect(checked()).toBe('true'))
    expect(toggles()).toBe('3')
  } finally {
    handle.dispose()
  }
})

test('a press that moves less than the slop is still a click', async () => {
  const handle = mount()
  try {
    await drawn()
    await drag(0.1, 0.15)
    await vi.waitFor(() => expect(checked()).toBe('true'))
    expect(toggles()).toBe('1')
  } finally {
    handle.dispose()
  }
})

test('a drag cancelled past the middle changes nothing and lets the thumb go', async () => {
  const handle = mount()
  try {
    await drawn()
    const { left, top, height } = control().getBoundingClientRect()
    const at = (type: string, x: number) =>
      control().dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 42,
          button: 0,
          buttons: 1,
          clientX: left + x,
          clientY: top + height / 2,
        }),
      )
    at('pointerdown', 4)
    at('pointermove', 30)
    expect(control().hasAttribute('data-dragging')).toBe(true)
    at('pointercancel', 30)
    expect(control().hasAttribute('data-dragging')).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect([checked(), toggles()]).toEqual(['false', '0'])
  } finally {
    handle.dispose()
  }
})

test('the thumb follows the pointer while it is held', async () => {
  const handle = mount()
  try {
    await drawn()
    const { left, width, height } = control().getBoundingClientRect()
    const y = control().getBoundingClientRect().top + height / 2
    const mouse = (type: string, x: number) =>
      control().dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 41,
          button: 0,
          buttons: 1,
          clientX: left + x,
          clientY: y,
        }),
      )
    mouse('pointerdown', 4)
    mouse('pointermove', 4 + 10)
    expect(control().hasAttribute('data-dragging')).toBe(true)
    expect(thumbAt()).toBeCloseTo((2 + 10 + 8) / width, 1)
    // Held at the far end, no further.
    mouse('pointermove', 400)
    expect(thumbAt()).toBeCloseTo((width - 2 - 8) / width, 1)
    mouse('pointerup', 400)
    await vi.waitFor(() => expect(checked()).toBe('true'))
    await vi.waitFor(() => expect(control().hasAttribute('data-dragging')).toBe(false))
  } finally {
    handle.dispose()
  }
})

test('right to left mirrors it: a drag toward the left turns it on', async () => {
  const handle = mount({ dir: 'rtl' })
  try {
    await drawn()
    await drag(0.75, 0.05)
    await vi.waitFor(() => expect(checked()).toBe('true'))
    expect(toggles()).toBe('1')
    // On, the thumb sits at the left end.
    expect(thumbAt()).toBeLessThan(0.5)
    await drag(0.25, 0.95)
    await vi.waitFor(() => expect(checked()).toBe('false'))
    expect(toggles()).toBe('2')
  } finally {
    handle.dispose()
  }
})

test('right to left: a drag toward the right changes nothing from off', async () => {
  const handle = mount({ dir: 'rtl' })
  try {
    await drawn()
    await drag(0.75, 0.95)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect([checked(), toggles()]).toEqual(['false', '0'])
  } finally {
    handle.dispose()
  }
})

test('a disabled switch does not drag', async () => {
  const handle = mount({ disabled: true })
  try {
    await drawn()
    await drag(0.2, 0.95)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect([checked(), toggles()]).toEqual(['false', '0'])
    expect(control().hasAttribute('data-dragging')).toBe(false)
  } finally {
    handle.dispose()
  }
})
