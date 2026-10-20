/**
 * The color picker in a real browser: a press on the area picks the point
 * under it and focuses the thumb, a drag follows the pointer, the thumb sits
 * on the color and under the pointer whatever padding the area has, its
 * keys step from the color before them however fast they come, the text
 * commits on Enter and goes back to the color when it names none, each
 * track runs from its minimum's side (the right one right to left), alpha
 * shows over a checkerboard, and the popover opens the picker from a swatch
 * of the color, on its thumb, stays open for a press, a drag or focus moving
 * inside it however it was opened, and closes when focus leaves it.
 */
import * as UiPopover from '@foldkit/ui/popover'
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ColorPicker, ColorPickerSlots, PopoverSlots, Recipes, SliderSlots } from '../src/index.js'

// A palette, which the checkerboard and the rings read.
const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))
const slider = Style.forSlots(SliderSlots)(Recipes.Slider({ track: 'paint', label: 'hidden' }))
const popoverStyle = Style.forSlots(PopoverSlots)(Recipes.Popover({}))
const Model = Schema.Struct({ picker: ColorPicker.Model, popover: UiPopover.Model })
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'GotPicker'; readonly message: ColorPicker.Message }
  | { readonly _tag: 'GotPopover'; readonly message: UiPopover.Message }
const GotPicker = (message: ColorPicker.Message): Message => ({ _tag: 'GotPicker', message })
const GotPopover = (message: UiPopover.Message): Message => ({ _tag: 'GotPopover', message })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

const mount = (
  options: {
    readonly dir?: 'rtl'
    readonly inPopover?: boolean
    /** Added after the recipes, unlayered, so it wins: a stylist's own rule. */
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
    style.css +
    slider.css +
    popoverStyle.css +
    (options.css ?? '')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'color-picker-browser'
  document.body.append(container)
  const shared = {
    label: 'Accent',
    onMessage: GotPicker,
    eyedropper: false,
    style,
    slider,
  }
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          picker: ColorPicker.init({ id: 'accent', color: ColorPicker.color('#3b82f6') }),
          popover: UiPopover.init({ id: 'accent-popover', contentFocus: true }),
        },
      }),
      update: (model: Model, message: Message) => {
        if (message._tag === 'GotPicker') {
          const next = ColorPicker.update(model.picker, message.message)
          return {
            model: next.model === model.picker ? model : { ...model, picker: next.model },
            commands: mapMessages(next.commands ?? [], GotPicker),
          }
        }
        const next = UiPopover.update(model.popover, message.message)
        return {
          model: { ...model, popover: next.model },
          commands: mapMessages(next.commands, GotPopover),
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ padding: '2rem', inlineSize: '20rem' })],
          [
            options.inPopover === true
              ? ColorPicker.popover(
                  {
                    ...shared,
                    model: model.picker,
                    popover: model.popover,
                    onPopover: GotPopover,
                    popoverMixins: [popoverStyle.mixin],
                  },
                  h,
                )
              : ColorPicker.view({ ...shared, model: model.picker }, h),
            // Somewhere for Tab to go past the picker.
            h.button([h.Type('button')], ['After']),
          ],
        ),
    }),
  )
}

const thumb = () => document.getElementById('accent-area')!
const area = () => thumb().parentElement!
const input = () => document.querySelector<HTMLInputElement>('#accent-input')
const shown = () => (document.getElementById('accent-input') as HTMLInputElement | null)?.value

test('a press picks the point under it and focuses the thumb, and a drag follows', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('accent-area')).not.toBeNull())
    const box = area().getBoundingClientRect()
    await userEvent.click(area(), { position: { x: box.width * 0.25, y: box.height * 0.5 } })
    await vi.waitFor(() =>
      expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 25%, Brightness 50%'),
    )
    expect(document.activeElement).toBe(thumb())
    // A drag: the press and moves the Mount hears, with one pointer between them.
    const at = (x: number, y: number) => ({
      bubbles: true,
      pointerId: 7,
      button: 0,
      clientX: box.left + box.width * x,
      clientY: box.top + box.height * y,
    })
    area().dispatchEvent(new PointerEvent('pointerdown', at(0.5, 0.5)))
    area().dispatchEvent(new PointerEvent('pointermove', at(0.9, 0.1)))
    await vi.waitFor(() =>
      expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 90%, Brightness 90%'),
    )
    area().dispatchEvent(new PointerEvent('pointerup', at(0.9, 0.1)))
    area().dispatchEvent(new PointerEvent('pointermove', at(0.1, 0.9)))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 90%, Brightness 90%')
    // The thumb's center is the point the color stands for.
    const center = thumb().getBoundingClientRect()
    expect(center.left + center.width / 2).toBeCloseTo(box.left + box.width * 0.9, 0)
    expect(center.top + center.height / 2).toBeCloseTo(box.top + box.height * 0.1, 0)
  } finally {
    handle.dispose()
  }
})

test('padding a stylist adds to the area leaves the thumb under the pointer', async () => {
  const handle = mount({ css: ':has(> #accent-area) { padding: 12px 40px }' })
  try {
    await vi.waitFor(() => expect(document.getElementById('accent-area')).not.toBeNull())
    // The padding box, inside any border: where the thumb is laid out.
    const { left, top } = area().getBoundingClientRect()
    const box = {
      left: left + area().clientLeft,
      top: top + area().clientTop,
      width: area().clientWidth,
      height: area().clientHeight,
    }
    area().dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 7,
        button: 0,
        clientX: box.left + box.width * 0.2,
        clientY: box.top + box.height * 0.3,
      }),
    )
    await vi.waitFor(() =>
      expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 20%, Brightness 70%'),
    )
    const center = thumb().getBoundingClientRect()
    expect(center.left + center.width / 2).toBeCloseTo(box.left + box.width * 0.2, 0)
    expect(center.top + center.height / 2).toBeCloseTo(box.top + box.height * 0.3, 0)
  } finally {
    handle.dispose()
  }
})

test('keys faster than a frame each step from the color before them', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('accent-area')).not.toBeNull())
    thumb().focus()
    await userEvent.keyboard(
      '{Home}{ArrowRight}{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{/Shift}',
    )
    await vi.waitFor(() =>
      expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 13%, Brightness 96%'),
    )
    // The page did not scroll for the keys the area took.
    const scrolled = window.scrollY
    await userEvent.keyboard('{PageDown}')
    await vi.waitFor(() =>
      expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 13%, Brightness 86%'),
    )
    expect(window.scrollY).toBe(scrolled)
  } finally {
    handle.dispose()
  }
})

test('the text commits on Enter, and goes back to the color when it names none', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(input()).not.toBeNull())
    await userEvent.clear(input()!)
    await userEvent.type(input()!, 'rgb(255 0 0){Enter}')
    await vi.waitFor(() => expect(shown()).toBe('#ff0000'))
    const swatch =
      document.querySelector<HTMLElement>('[data-channel="alpha"]')!.parentElement!
        .nextElementSibling!
    expect(getComputedStyle(swatch).backgroundImage).toContain('rgb(255, 0, 0)')
    await userEvent.clear(input()!)
    await userEvent.type(input()!, 'nonsense{Enter}')
    await vi.waitFor(() => expect(shown()).toBe('#ff0000'))
    expect(input()!.getAttribute('aria-invalid')).toBeNull()
    await userEvent.selectOptions(document.querySelector('select')!, 'hsl')
    await vi.waitFor(() => expect(shown()).toBe('hsl(0 100% 50%)'))
  } finally {
    handle.dispose()
  }
})

const trackOf = (channel: 'hue' | 'alpha') =>
  document.querySelector<HTMLElement>(`[data-channel="${channel}"] input`)!.previousElementSibling!

test.each([
  ['ltr', 'linear-gradient(to right'],
  ['rtl', 'linear-gradient(to left'],
] as const)('%s: each track runs from its minimum’s side', async (dir, start) => {
  const handle = mount(dir === 'rtl' ? { dir } : {})
  try {
    await vi.waitFor(() => expect(document.querySelector('[data-channel="alpha"]')).not.toBeNull())
    for (const channel of ['hue', 'alpha'] as const) {
      expect(getComputedStyle(trackOf(channel)).backgroundImage.startsWith(start)).toBe(true)
    }
    // Transparency over a checkerboard, so it reads as such.
    expect(getComputedStyle(trackOf('alpha')).backgroundImage).toContain('repeating-conic-gradient')
  } finally {
    handle.dispose()
  }
})

test('the popover opens the picker from a swatch of the color', async () => {
  const handle = mount({ inPopover: true })
  try {
    const button = await vi.waitFor(() => {
      const found = document.getElementById('accent-popover-button')
      expect(found).not.toBeNull()
      return found!
    })
    expect(button.textContent).toBe('#3b82f6')
    expect(document.getElementById('accent-area')).toBeNull()
    await userEvent.click(button)
    await vi.waitFor(() => expect(document.getElementById('accent-area')).not.toBeNull())
    const panel = thumb().closest('[popover]')!
    expect(panel.matches(':popover-open')).toBe(true)
    // The trigger's swatch is the color.
    const swatch = button.querySelector('[aria-hidden="true"]')!
    expect(getComputedStyle(swatch).backgroundImage).toContain('rgb(59, 130, 246)')
  } finally {
    handle.dispose()
  }
})

/** The popover, opened from the keys: the way a pointer of a mouse never comes into it. */
const openFromKeys = async () => {
  const button = await vi.waitFor(() => {
    const found = document.getElementById('accent-popover-button')
    expect(found).not.toBeNull()
    return found!
  })
  button.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(document.getElementById('accent-area')).not.toBeNull())
}
const isOpen = () => document.getElementById('accent-area') !== null

test('opened from the keys, the panel is on its thumb, and a press and a drag inside keep it open', async () => {
  const handle = mount({ inPopover: true })
  try {
    await openFromKeys()
    await vi.waitFor(() => expect(document.activeElement).toBe(thumb()))
    const box = area().getBoundingClientRect()
    await userEvent.click(area(), { position: { x: box.width * 0.25, y: box.height * 0.5 } })
    await vi.waitFor(() =>
      expect(thumb().getAttribute('aria-valuetext')).toBe('Saturation 25%, Brightness 50%'),
    )
    // A press on its words, which take no focus, is a press inside too.
    await userEvent.click(document.getElementById('accent-label')!)
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    expect(isOpen()).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('focus moving inside the panel keeps it open, and leaving it closes it', async () => {
  const handle = mount({ inPopover: true })
  try {
    await openFromKeys()
    await vi.waitFor(() => expect(document.activeElement).toBe(thumb()))
    const panel = thumb().closest('[popover]')!
    await userEvent.tab()
    expect(panel.contains(document.activeElement)).toBe(true)
    expect(isOpen()).toBe(true)
    while (panel.contains(document.activeElement)) await userEvent.tab()
    expect(document.activeElement?.textContent).toBe('After')
    await vi.waitFor(() => expect(isOpen()).toBe(false))
    // Closed where Tab went: the trigger does not take focus back.
    expect(document.activeElement?.textContent).toBe('After')
  } finally {
    handle.dispose()
  }
})

test('a Popover that keeps its own focus is refused, naming what it needs', () => {
  expect(() =>
    ColorPicker.popover(
      {
        label: 'Accent',
        model: ColorPicker.init({ id: 'refused' }),
        onMessage: GotPicker,
        popover: UiPopover.init({ id: 'refused-popover' }),
        onPopover: GotPopover,
      },
      // Refused before anything is drawn, so no builder is reached.
      undefined as never,
    ),
  ).toThrow(/contentFocus: true/)
})
