/**
 * The angle slider in a real browser: a press turns the dial to the pointer
 * and focuses the thumb, a drag follows until the release, whatever padding
 * the dial has, the thumb sits on the ring at the angle, the keys step from
 * the value before them however fast they come and keep the page still, the
 * dial turns the same way right to left, and a marker the arc covers is
 * filled.
 */
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Schema } from 'effect'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as AngleSlider from '../src/angleSlider.js'
import { AngleSliderSlots } from '../src/angleSlider.js'
import { AngleSlider as Recipe } from '../src/recipes/angleSlider.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(AngleSliderSlots)(Recipe({ size: 'lg' }))
const layout = { step: 1, marks: [{ value: 0 }, { value: 90 }, { value: 180 }, { value: 270 }] }
const fold = AngleSlider.update(layout)

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mount = (
  options: {
    readonly dir?: 'rtl' | undefined
    readonly value?: number
    readonly style?: typeof style
    readonly format?: (value: number) => string
    /** Added after the recipe, unlayered, so it wins: a stylist's own rule. */
    readonly css?: string
  } = {},
) => {
  if (options.dir !== undefined) document.documentElement.dir = options.dir
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    (options.style ?? style).css +
    (options.css ?? '')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'angle-slider-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model: AngleSlider.Model,
      container,
      init: () => ({ model: AngleSlider.init({ id: 'heading', value: options.value ?? 0 }) }),
      update: (model: AngleSlider.Model, message: AngleSlider.Message) => fold(model, message),
      view: (model: AngleSlider.Model, h: HtmlBuilder<AngleSlider.Message>) =>
        h.div(
          [h.Style({ padding: '2rem', blockSize: '200vh' })],
          [
            AngleSlider.view(
              {
                ...layout,
                model,
                label: 'Heading',
                onMessage: m => m,
                style: options.style ?? style,
                ...(options.format === undefined ? {} : { format: options.format }),
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const thumb = () => document.getElementById('heading-thumb')!
const control = () => thumb().parentElement!
const valueOf = () => thumb().getAttribute('aria-valuenow')
const ready = () =>
  vi.waitFor(() => expect(document.getElementById('heading-thumb')).not.toBeNull())
const frames = () =>
  new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))

/** The point at `degrees` clockwise from the top, `share` of the way from the center to the edge. */
const pointAt = (degrees: number, share = 0.9) => {
  const box = control().getBoundingClientRect()
  const radians = (degrees * Math.PI) / 180
  return {
    x: box.width / 2 + Math.sin(radians) * (box.width / 2) * share,
    y: box.height / 2 - Math.cos(radians) * (box.height / 2) * share,
  }
}

const pointer = (type: string, degrees: number) => {
  const box = control().getBoundingClientRect()
  const { x, y } = pointAt(degrees)
  control().dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      pointerId: 3,
      button: 0,
      clientX: box.left + x,
      clientY: box.top + y,
    }),
  )
}

test.each([undefined, 'rtl'] as const)(
  'a press turns the dial to the pointer and focuses the thumb, a drag follows (dir %s)',
  async dir => {
    const handle = mount({ dir })
    try {
      await ready()
      await userEvent.click(control(), { position: pointAt(90) })
      await vi.waitFor(() => expect(valueOf()).toBe('90'))
      expect(document.activeElement).toBe(thumb())
      pointer('pointerdown', 135)
      pointer('pointermove', 225)
      await vi.waitFor(() => expect(valueOf()).toBe('225'))
      expect(control().closest('[data-dragging]')).not.toBeNull()
      pointer('pointerup', 225)
      pointer('pointermove', 300)
      await frames()
      expect(valueOf()).toBe('225')
      expect(control().closest('[data-dragging]')).toBeNull()
    } finally {
      handle.dispose()
    }
  },
)

test.each([0, 90, 225])('the thumb sits on the ring at %s degrees', async degrees => {
  const handle = mount({ value: degrees })
  try {
    await ready()
    await frames()
    const box = control().getBoundingClientRect()
    const at = thumb().getBoundingClientRect()
    const dx = at.left + at.width / 2 - (box.left + box.width / 2)
    const dy = at.top + at.height / 2 - (box.top + box.height / 2)
    const angle = ((((Math.atan2(dx, -dy) * 180) / Math.PI) % 360) + 360) % 360
    const off = Math.abs(angle - degrees)
    expect(Math.min(off, 360 - off)).toBeLessThan(1)
    // On the ring: inside the dial, nearer its edge than its center.
    expect(Math.hypot(dx, dy)).toBeGreaterThan(box.width / 4)
    expect(Math.hypot(dx, dy)).toBeLessThan(box.width / 2)
  } finally {
    handle.dispose()
  }
})

test('padding a stylist adds to one side of the dial leaves the angle the pointer points to', async () => {
  // The thumb rides the padding box's center; the content box's sits 20px to its right.
  const handle = mount({ value: 90, css: ':has(> #heading-thumb) { padding-left: 40px }' })
  try {
    await ready()
    pointer('pointerdown', 0)
    await vi.waitFor(() => expect(valueOf()).toBe('0'))
    pointer('pointermove', 315)
    await vi.waitFor(() => expect(valueOf()).toBe('315'))
  } finally {
    handle.dispose()
  }
})

test('keys faster than a frame each step from the value before them, and keep the page still', async () => {
  const handle = mount()
  try {
    await ready()
    thumb().focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{Shift>}{ArrowUp}{/Shift}')
    await vi.waitFor(() => expect(valueOf()).toBe('18'))
    const scrolled = window.scrollY
    await userEvent.keyboard('{PageDown}{PageDown}')
    await vi.waitFor(() => expect(valueOf()).toBe('348'))
    expect(window.scrollY).toBe(scrolled)
  } finally {
    handle.dispose()
  }
})

test('a marker the arc covers is filled, and one past it is not', async () => {
  const handle = mount({ value: 135 })
  try {
    await ready()
    const fill = (state: string) =>
      getComputedStyle(document.querySelector(`[data-state="${state}"]`)!).backgroundColor
    expect(fill('under')).not.toBe(fill('over'))
  } finally {
    handle.dispose()
  }
})

test('a theme with square corners keeps the dial, its thumb and its markers round', async () => {
  const handle = mount({ css: ':root { --fk-knob-radius-factor: 0 }' })
  try {
    await ready()
    const marker = document.querySelector('[data-state]')!
    for (const element of [control(), thumb(), marker]) {
      expect(getComputedStyle(element).borderTopLeftRadius).toBe('50%')
    }
  } finally {
    handle.dispose()
  }
})

const sized = (size: 'sm' | 'md' | 'lg') => Style.forSlots(AngleSliderSlots)(Recipe({ size }))

test.each(
  (['sm', 'md', 'lg'] as const).flatMap(size =>
    [0, 45, 90, 135, 270].map(value => [size, value] as const),
  ),
)('the needle at %s, %s degrees, clears the value in the middle', async (size, value) => {
  const handle = mount({ value, style: sized(size), format: () => '1 of 4' })
  try {
    await ready()
    await frames()
    // The value is drawn last in the dial, the needle just before the thumb.
    const text = control().lastElementChild!
    const range = document.createRange()
    range.selectNodeContents(text)
    const words = range.getBoundingClientRect()
    expect(text.textContent).toBe('1 of 4')
    const needle = thumb().previousElementSibling!.getBoundingClientRect()
    // The needle is drawn, and its box (rotated, so its bounds) misses the words'.
    expect(needle.width * needle.height).toBeGreaterThan(0)
    const apart =
      needle.right <= words.left ||
      needle.left >= words.right ||
      needle.bottom <= words.top ||
      needle.top >= words.bottom
    expect(apart).toBe(true)
  } finally {
    handle.dispose()
  }
})
