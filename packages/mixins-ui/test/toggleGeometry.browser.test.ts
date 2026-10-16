/**
 * Toggles on the size ladder, on a real page: a checkbox is 16px (14px
 * compact); a switch is a 34×20 track with a 16px thumb, which stretches
 * 2px into a pill under the pointer and, when on, keeps its far edge where
 * it was.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, SlotView, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { CheckboxSlots, Recipes, SwitchSlots } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const checkbox = Style.forSlots(CheckboxSlots)(Recipes.Checkbox({}))
const toggle = Style.forSlots(SwitchSlots)(Recipes.Switch({}))
const Model = Schema.Struct({})

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (motion = '0') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    checkbox.css +
    toggle.css +
    // Still, so a stretch is read where it ends rather than mid-flight.
    `:root{--fk-knob-motion:${motion}}`
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'toggle-geometry'
  document.body.appendChild(container)
  const view = (_: unknown, h: HtmlBuilder<never>) => {
    const c = SlotView.buildersFor(CheckboxSlots, [checkbox.mixin], { input: undefined, h })
    const s = SlotView.buildersFor(SwitchSlots, [toggle.mixin], { input: undefined, h })
    return h.div(
      [h.Style({ padding: '40px' })],
      [
        h.button(
          c.checkbox.attrs([h.AriaLabel('box'), h.Role('checkbox'), h.AriaChecked(false)]),
          [],
        ),
        h.div(
          [h.Style({ '--fk-knob-step': '1' })],
          [
            h.button(
              c.checkbox.attrs([
                h.AriaLabel('compact box'),
                h.Role('checkbox'),
                h.AriaChecked(false),
              ]),
              [],
            ),
          ],
        ),
        h.button(s.button.attrs([h.AriaLabel('off'), h.Role('switch'), h.AriaChecked(false)]), []),
        h.button(s.button.attrs([h.AriaLabel('on'), h.Role('switch'), h.AriaChecked(true)]), []),
        h.button(
          c.checkbox.attrs([h.AriaLabel('checked'), h.Role('checkbox'), h.AriaChecked(true)]),
          [],
        ),
        h.button(
          c.checkbox.attrs([h.AriaLabel('mixed'), h.Role('checkbox'), h.AriaChecked('mixed')]),
          [],
        ),
        // As under reduced motion, which zeroes `travel`.
        h.div(
          [h.Style({ '--fk-knob-travel': '0' })],
          [
            h.button(
              c.checkbox.attrs([
                h.AriaLabel('still box'),
                h.Role('checkbox'),
                h.AriaChecked(false),
              ]),
              [],
            ),
          ],
        ),
      ],
    )
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
}

const box = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`)!.getBoundingClientRect()
/** The thumb's box: the switch's `::before`, read from its computed place and size. */
const thumb = (label: string) => {
  const element = document.querySelector(`[aria-label="${label}"]`)!
  const style = getComputedStyle(element, '::before')
  const [x] = style.translate === 'none' ? ['0'] : style.translate.split(' ')
  const start = Number.parseFloat(style.insetInlineStart) + Number.parseFloat(x ?? '0')
  return {
    start,
    width: Number.parseFloat(style.inlineSize),
    height: Number.parseFloat(style.blockSize),
  }
}
const drawn = () =>
  vi.waitFor(() => expect(document.querySelector('[aria-label="on"]')).not.toBeNull())

test('a checkbox stands on the ladder: 16px, and 14px compact', async () => {
  const handle = mount()
  try {
    await drawn()
    expect([box('box').width, box('box').height]).toEqual([16, 16])
    expect([box('compact box').width, box('compact box').height]).toEqual([14, 14])
  } finally {
    handle.dispose()
  }
})

test('a switch is a 34×20 track with a 16px thumb, at the far end when on', async () => {
  const handle = mount()
  try {
    await drawn()
    expect([box('off').width, box('off').height]).toEqual([34, 20])
    expect(thumb('off')).toEqual({ start: 2, width: 16, height: 16 })
    // On, the thumb's far edge is 2px in from the track's.
    const on = thumb('on')
    expect(on.start + on.width).toBe(34 - 2)
  } finally {
    handle.dispose()
  }
})

/** The check or dash: the box's `::after`. */
const mark = (label: string) => {
  const element = document.querySelector(`[aria-label="${label}"]`)!
  const style = getComputedStyle(element, '::after')
  return {
    width: Number.parseFloat(style.inlineSize),
    height: Number.parseFloat(style.blockSize),
    rotate: style.rotate,
    clipPath: style.clipPath,
    duration: style.transitionDuration,
  }
}

/** How much of the mark's box its `inset()` clip leaves showing, from 0 to 1. */
const shownOf = ({ width, height, clipPath }: ReturnType<typeof mark>) => {
  if (clipPath === 'none') return 1
  const match = /^inset\(([^)]*)\)$/.exec(clipPath)
  if (match === null) throw new Error(`not an inset() clip: ${clipPath}`)
  const values = match[1]!.split(/\s+/)
  const [top, right = top, bottom = top, left = right] = values
  const px = (value: string | undefined, size: number) =>
    value!.endsWith('%') ? (Number.parseFloat(value!) / 100) * size : Number.parseFloat(value!)
  const across = Math.max(0, width - px(left, width) - px(right, width)) / width
  const down = Math.max(0, height - px(top, height) - px(bottom, height)) / height
  return across * down
}

// Every box draws its mark so that checking can wipe it in; only the clip
// says whether it shows, so the clip is what each case reads.
test('a checked box shows its check, an unchecked one none, and a mixed one a dash', async () => {
  const handle = mount()
  try {
    await drawn()
    expect(shownOf(mark('checked'))).toBe(1)
    expect(shownOf(mark('box'))).toBe(0)
    const mixed = mark('mixed')
    expect(shownOf(mixed)).toBe(1)
    // A dash runs across the box. The check's own box is taller than it is wide.
    expect(mixed.width).toBeGreaterThan(mixed.height * 2)
    expect(mixed.rotate).toBe('none')
  } finally {
    handle.dispose()
  }
})

test('the check wipes in over time, and at once under reduced motion', async () => {
  const handle = mount('1')
  try {
    await drawn()
    expect(Number.parseFloat(mark('box').duration)).toBeGreaterThan(0)
    expect(mark('still box').duration).toBe('0s')
  } finally {
    handle.dispose()
  }
})

test('hovered, the thumb stretches 2px, and when on it keeps its far edge', async () => {
  const handle = mount()
  try {
    await drawn()
    await userEvent.hover(document.querySelector('[aria-label="on"]')!)
    await vi.waitFor(() => expect(thumb('on').width).toBe(18))
    expect(thumb('on').start + thumb('on').width).toBe(34 - 2)
  } finally {
    handle.dispose()
  }
})
