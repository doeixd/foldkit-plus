/// <reference types="@vitest/browser-playwright" />
/**
 * Thinking indicators in a real browser over the shipped palette: the dots
 * rise in turn on the words' line, the band sweeps the words for a travel's
 * time and none with no travel, the other way right to left; held, by a
 * still theme or reduced motion, it shows its dots as a fading trail and its
 * band resting across the words, not its first frame; a pulse is one dot,
 * hidden words are still in the page, and the detail takes a line of its own.
 */
import { Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp } from 'vitest/browser'
import {
  ThinkingIndicatorSlots,
  view as indicator,
  type ThinkingIndicatorView,
} from '../src/thinkingIndicator.js'
import { ThinkingIndicator } from '../src/recipes/thinkingIndicator.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const L = Layers.standard
const Model = Schema.Struct({})
const styleOf = (selection: Parameters<typeof ThinkingIndicator>[0]) =>
  Style.forSlots(ThinkingIndicatorSlots)(ThinkingIndicator(selection))
const styles = {
  dots: styleOf({}),
  pulse: styleOf({ mark: 'pulse', label: 'plain' }),
  hidden: styleOf({ label: 'hidden' }),
  accent: styleOf({ tone: 'accent', label: 'plain' }),
}

const reduce = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

afterEach(async () => {
  await reduce('no-preference')
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const shown = (id: string, options: ThinkingIndicatorView, h: HtmlBuilder<never>) =>
  h.div([h.Id(id)], [indicator(options, h)])

const view = (_: unknown, h: HtmlBuilder<never>): Html =>
  h.div(
    [h.Style({ display: 'grid', gap: '1rem', padding: '16px', justifyItems: 'start' })],
    [
      shown('dots', { detail: 'Searching the web', style: styles.dots }, h),
      h.div(
        [h.Attribute('style', '--fk-knob-travel: 0')],
        [shown('held', { style: styles.dots }, h)],
      ),
      h.div([h.Attribute('dir', 'rtl')], [shown('rtl', { style: styles.dots }, h)]),
      shown('pulse', { style: styles.pulse }, h),
      shown('hidden', { style: styles.hidden }, h),
      shown('accent', { style: styles.accent }, h),
      shown('plainInk', { style: styles.pulse }, h),
    ],
  )

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      L.declare,
      L.in('reset', Defaults.reset),
      L.in('theme', Theme.root(theme, { colorScheme: 'light' })),
    ) +
    Object.values(styles)
      .map(style => style.css)
      .join('')
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'thinking'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view,
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('plainInk')).not.toBeNull())
  return handle
}

const status = (id: string) => document.querySelector<HTMLElement>(`#${id} [role="status"]`)!
const partsOf = (id: string) => {
  const [mark, label, detail] = Array.from(status(id).children) as Array<HTMLElement>
  return {
    mark: mark!,
    label: label!,
    detail,
    dots: Array.from(mark!.children) as Array<HTMLElement>,
  }
}
const box = (element: Element) => element.getBoundingClientRect()
const seconds = (element: Element) => parseFloat(getComputedStyle(element).animationDuration)

test('the dots rise in turn on the words’ line, the detail on a line of its own', async () => {
  const handle = await mount()
  try {
    const { mark, label, detail, dots } = partsOf('dots')
    expect(dots).toHaveLength(3)
    const [a, b, c] = dots.map(box)
    expect(b!.left).toBeGreaterThan(a!.right)
    expect(c!.left).toBeGreaterThan(b!.right)
    expect(new Set(dots.map(dot => getComputedStyle(dot).animationDelay)).size).toBe(3)
    expect(seconds(dots[0]!)).toBeGreaterThan(0.3)
    const words = box(label)
    expect(words.left).toBeGreaterThan(box(mark).right)
    expect(
      Math.abs(box(mark).top + box(mark).height / 2 - (words.top + words.height / 2)),
    ).toBeLessThan(1)
    expect(box(detail!).top).toBeGreaterThanOrEqual(words.bottom)
    expect(Math.abs(box(detail!).left - box(mark).left)).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})

test('the band sweeps the words for a travel’s time, none with no travel, reversed right to left', async () => {
  const handle = await mount()
  try {
    const { label } = partsOf('dots')
    const words = getComputedStyle(label)
    expect(words.color).toBe('rgba(0, 0, 0, 0)')
    expect(words.backgroundClip).toBe('text')
    expect(seconds(label)).toBeGreaterThan(1)
    expect(words.animationDirection).toBe('normal')
    expect(seconds(partsOf('held').label)).toBe(0)
    expect(seconds(partsOf('held').dots[0]!)).toBe(0)
    expect(getComputedStyle(partsOf('rtl').label).animationDirection).toBe('reverse')
  } finally {
    handle.dispose()
  }
})

/** What a held indicator shows: its dots' trail and where its band rests. */
const heldLook = (id: string) => {
  const { label, dots } = partsOf(id)
  return {
    dots: dots.map(dot => Number(getComputedStyle(dot).opacity)),
    band: getComputedStyle(label).backgroundPositionX,
  }
}

test('in a still theme it still reads as at work: its dots a fading trail, its band across the words', async () => {
  // The durations resolve where the root declares them: still the theme there.
  document.documentElement.style.setProperty('--fk-knob-motion', '0')
  const handle = await mount()
  try {
    expect(seconds(partsOf('dots').label)).toBe(0)
    expect(heldLook('dots')).toEqual({ dots: [1, 0.7, 0.4], band: '50%' })
  } finally {
    handle.dispose()
    document.documentElement.style.removeProperty('--fk-knob-motion')
  }
})

test('under reduced motion every movement holds, held as a still theme is', async () => {
  await reduce('reduce')
  const handle = await mount()
  try {
    const { label, dots } = partsOf('dots')
    expect(getComputedStyle(label).animationName).toBe('none')
    for (const dot of [...dots, ...partsOf('pulse').dots])
      expect(getComputedStyle(dot).animationName).toBe('none')
    expect(heldLook('dots')).toEqual({ dots: [1, 0.7, 0.4], band: '50%' })
  } finally {
    handle.dispose()
  }
})

test('a pulse is one dot; hidden words stay in the page; a tone inks it', async () => {
  const handle = await mount()
  try {
    const shownDots = partsOf('pulse').dots.filter(dot => getComputedStyle(dot).display !== 'none')
    expect(shownDots).toHaveLength(1)
    const hidden = partsOf('hidden').label
    expect(hidden.textContent).toBe('Thinking')
    expect(box(hidden).width).toBeLessThanOrEqual(1)
    expect(getComputedStyle(partsOf('accent').label).color).not.toBe(
      getComputedStyle(partsOf('plainInk').label).color,
    )
  } finally {
    handle.dispose()
  }
})
