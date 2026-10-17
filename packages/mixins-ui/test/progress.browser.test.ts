/**
 * Progress in a real browser: an indeterminate bar's fill sweeps from
 * beyond the track's inline start to beyond its inline end, so right to left
 * it enters on the right and leaves on the left. The value stands beside a
 * bar's label and inside a ring; a stacked bar's parts and a buffer are as
 * wide as their shares; stripes slide only as far as `travel` lets; a tone
 * is the token Meter's levels use; and a segmented track is cut.
 */
import { Option, Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
// From the modules, not the index: the test reads nothing else.
import * as Progress from '../src/progress.js'
import { ProgressSlots, type ProgressView } from '../src/progress.js'
import * as Recipes from '../src/recipes/progress.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(ProgressSlots)(Recipes.Progress({}))
const Model = Schema.Struct({})
type Model = typeof Model.Type

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (direction: 'ltr' | 'rtl') => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = `progress-${direction}`
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: Model) => ({ model }),
      view: (_model: Model, h: HtmlBuilder<never>) =>
        h.div(
          [h.Dir(direction), h.Style({ inlineSize: '200px' })],
          [Progress.view({ id: 'load', label: 'Loading', value: Option.none(), style }, h)],
        ),
    }),
  )
}

/** The track's and the fill's boxes with the sweep held at `progress`, 0 to 1. */
const at = (progress: number) => {
  const track = document.querySelector('[role="progressbar"] > div')!
  const fill = track.firstElementChild!
  const [sweep] = fill.getAnimations()
  if (sweep === undefined) throw new Error('the fill does not move')
  sweep.pause()
  const duration = Number(sweep.effect!.getComputedTiming().duration)
  sweep.currentTime = duration * progress
  return { track: track.getBoundingClientRect(), fill: fill.getBoundingClientRect() }
}

test('left to right, the fill enters on the left and leaves on the right', async () => {
  const mounted = mount('ltr')
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="progressbar"]')).not.toBeNull())
    const start = at(0)
    expect(start.fill.right).toBeLessThanOrEqual(start.track.left + 1)
    const end = at(0.999)
    expect(end.fill.left).toBeGreaterThanOrEqual(end.track.right - 2)
  } finally {
    mounted.dispose()
  }
})

test('right to left, the fill enters on the right and leaves on the left', async () => {
  const mounted = mount('rtl')
  try {
    await vi.waitFor(() => expect(document.querySelector('[role="progressbar"]')).not.toBeNull())
    const start = at(0)
    expect(start.fill.left).toBeGreaterThanOrEqual(start.track.right - 1)
    const end = at(0.999)
    expect(end.fill.right).toBeLessThanOrEqual(end.track.left + 2)
  } finally {
    mounted.dispose()
  }
})

/** Draws `options` as a progress of `selection`, in a box 300px wide. */
const show = (
  selection: Parameters<typeof Recipes.Progress>[0],
  options: Partial<ProgressView<never>>,
  wrapper: Record<string, string> = {},
) => {
  const look = Style.forSlots(ProgressSlots)(Recipes.Progress(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    look.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'progress-shown'
  document.body.appendChild(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: Model) => ({ model }),
      view: (_model: Model, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ inlineSize: '300px', ...wrapper })],
          [
            Progress.view(
              { id: 'job', label: 'Copying', value: Option.some(40), style: look, ...options },
              h,
            ),
            // A probe painted with the success token, to compare a fill against.
            h.div([h.Id('probe'), h.Style({ background: 'var(--fk-success-default)' })], []),
          ],
        ),
    }),
  )
}

const drawn = async () => {
  await vi.waitFor(() => expect(document.querySelector('[role="progressbar"]')).not.toBeNull())
  const root = document.querySelector<HTMLElement>('[role="progressbar"]')!
  const [label, ...rest] = Array.from(root.children) as Array<HTMLElement>
  return { root, label: label!, rest }
}

const probe = () => getComputedStyle(document.getElementById('probe')!).backgroundColor

const clear = () => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
}

test('a bar shows its value at the end of its label’s line', async () => {
  const mounted = show({}, { showValue: true })
  try {
    const { root, label, rest } = await drawn()
    const [value, track] = rest as [HTMLElement, HTMLElement]
    expect(value.textContent).toBe('40%')
    const box = value.getBoundingClientRect()
    expect(Math.round(box.top)).toBe(Math.round(label.getBoundingClientRect().top))
    expect(Math.round(box.right)).toBe(Math.round(root.getBoundingClientRect().right))
    // The track spans the line below both.
    expect(Math.round(track.getBoundingClientRect().width)).toBe(
      Math.round(root.getBoundingClientRect().width),
    )
    expect(track.getBoundingClientRect().top).toBeGreaterThanOrEqual(box.bottom)
  } finally {
    mounted.dispose()
  }
})

test('a ring shows its value inside', async () => {
  const mounted = show({ shape: 'ring', size: 'lg' }, { showValue: true })
  try {
    const { rest } = await drawn()
    const [value, track] = rest as [HTMLElement, HTMLElement]
    const ring = track.getBoundingClientRect()
    const text = value.getBoundingClientRect()
    expect(ring.width).toBeGreaterThan(60)
    expect(Math.abs(text.left + text.width / 2 - (ring.left + ring.width / 2))).toBeLessThan(1.5)
    expect(Math.abs(text.top + text.height / 2 - (ring.top + ring.height / 2))).toBeLessThan(1.5)
  } finally {
    mounted.dispose()
  }
})

test('size widens the ring and thickens the bar', async () => {
  const measure = async (size: 'sm' | 'lg') => {
    const ring = show({ shape: 'ring', size }, {})
    const across = (await drawn()).rest[0]!.getBoundingClientRect().width
    ring.dispose()
    clear()
    const bar = show({ size }, {})
    const thick = (await drawn()).rest[0]!.getBoundingClientRect().height
    bar.dispose()
    clear()
    return { across, thick }
  }
  const small = await measure('sm')
  const large = await measure('lg')
  expect(large.across).toBeGreaterThan(small.across)
  expect(large.thick).toBeGreaterThan(small.thick)
})

test('a stacked bar’s parts stand side by side, each as wide as its share, in its tone', async () => {
  const mounted = show(
    {},
    {
      value: [
        { label: 'Photos', value: 30, tone: 'success' },
        { label: 'Mail', value: 20, tone: 'warning' },
      ],
    },
  )
  try {
    const { rest } = await drawn()
    const [track] = rest as [HTMLElement]
    const width = track.getBoundingClientRect().width
    const [photos, mail] = Array.from(track.children) as [HTMLElement, HTMLElement]
    expect(photos.getBoundingClientRect().width / width).toBeCloseTo(0.3, 2)
    expect(mail.getBoundingClientRect().width / width).toBeCloseTo(0.2, 2)
    expect(Math.round(mail.getBoundingClientRect().left)).toBe(
      Math.round(photos.getBoundingClientRect().right),
    )
    expect(getComputedStyle(photos).backgroundColor).toBe(probe())
    expect(getComputedStyle(mail).backgroundColor).not.toBe(probe())
  } finally {
    mounted.dispose()
  }
})

test('a buffer runs ahead of the fill, under it', async () => {
  const mounted = show({}, { buffer: 70 })
  try {
    const { rest } = await drawn()
    const [track] = rest as [HTMLElement]
    const [buffer, fill] = Array.from(track.children) as [HTMLElement, HTMLElement]
    const width = track.getBoundingClientRect().width
    await vi.waitFor(() => expect(buffer.getBoundingClientRect().width / width).toBeCloseTo(0.7, 2))
    expect(fill.getBoundingClientRect().width / width).toBeCloseTo(0.4, 2)
    expect(Math.round(buffer.getBoundingClientRect().left)).toBe(
      Math.round(track.getBoundingClientRect().left),
    )
    const box = fill.getBoundingClientRect()
    expect(document.elementFromPoint(box.left + 4, box.top + box.height / 2)).toBe(fill)
  } finally {
    mounted.dispose()
  }
})

test('a tone fills with the token Meter’s levels use', async () => {
  const mounted = show({ tone: 'success' }, {})
  try {
    const { rest } = await drawn()
    expect(getComputedStyle(rest[0]!.firstElementChild!).backgroundColor).toBe(probe())
  } finally {
    mounted.dispose()
  }
})

const fillOf = async () => (await drawn()).rest[0]!.firstElementChild as HTMLElement

test('moving stripes slide, and stand still where `travel` is 0', async () => {
  let mounted = show({ stripes: 'moving' }, {})
  try {
    const fill = await fillOf()
    expect(getComputedStyle(fill).backgroundImage).toContain('linear-gradient')
    const [slide] = fill.getAnimations()
    expect(Number(slide!.effect!.getComputedTiming().duration)).toBeGreaterThan(0)
  } finally {
    mounted.dispose()
    clear()
  }
  mounted = show({ stripes: 'moving' }, {}, { '--fk-knob-travel': '0' })
  try {
    const fill = await fillOf()
    expect(getComputedStyle(fill).backgroundImage).toContain('linear-gradient')
    const running = fill
      .getAnimations()
      .filter(animation => Number(animation.effect!.getComputedTiming().duration) > 0)
    expect(running).toEqual([])
  } finally {
    mounted.dispose()
  }
})

test('still stripes stay still, and an unknown end keeps its sweep under moving ones', async () => {
  let mounted = show({ stripes: 'still' }, {})
  try {
    const fill = await fillOf()
    expect(getComputedStyle(fill).backgroundImage).toContain('linear-gradient')
    expect(fill.getAnimations()).toEqual([])
  } finally {
    mounted.dispose()
    clear()
  }
  mounted = show({ stripes: 'moving' }, { value: Option.none() })
  try {
    const fill = await fillOf()
    // One animation, the sweep, which moves the fill rather than its bands.
    const moved = fill
      .getAnimations()
      .map(animation =>
        animation.effect instanceof KeyframeEffect
          ? animation.effect.getKeyframes().some(frame => 'translate' in frame)
          : false,
      )
    expect(moved).toEqual([true])
  } finally {
    mounted.dispose()
  }
})

test('a segmented track is cut into steps, and its fill’s end is square', async () => {
  const mounted = show({}, { segments: 4, value: Option.some(2), max: 4 })
  try {
    const { rest } = await drawn()
    const [track] = rest as [HTMLElement]
    expect(getComputedStyle(track).maskImage).toContain('repeating-linear-gradient')
    expect(getComputedStyle(track.firstElementChild!).borderEndEndRadius).toBe('0px')
  } finally {
    mounted.dispose()
  }
})
