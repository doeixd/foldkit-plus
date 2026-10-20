/**
 * Steps laid out by a real browser: a vertical stepper's line runs from a
 * marker's foot to the next marker's top, however tall the words beside it,
 * and a row in a phone-wide container shows only the current step's label,
 * clear of its neighbours' markers, the markers evenly spaced; a marker of each size is the Avatar of
 * that size; a step's content is no larger than its title; the Progress
 * connector fills after a complete step and, after the current one, by the
 * share done; and a dot marker is the Badge's dot.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Avatar, AvatarSlots, Recipes, Steps, StepsSlots } from '../src/index.js'

const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const steps = [
  { title: 'Account', description: 'Your name, your email, and a password long enough to keep.' },
  { title: 'Workspace settings', description: 'Where your team works' },
  { title: 'Invite your team', description: 'Who works with you' },
  { title: 'Done' },
]

type Selection = Parameters<typeof Recipes.Steps>[0]

const mount = (
  orientation: 'horizontal' | 'vertical',
  width: string,
  more: {
    readonly selection?: Selection
    readonly progress?: number
    readonly steps?: (h: HtmlBuilder<never>) => ReadonlyArray<Steps.Step>
    readonly avatar?: 'xs' | 'sm' | 'md' | 'lg'
  } = {},
) => {
  const style = Style.forSlots(StepsSlots)(Recipes.Steps({ orientation, ...more.selection }))
  const avatar = Style.forSlots(AvatarSlots)(Recipes.Avatar({ size: more.avatar ?? 'md' }))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.tokens)),
    ) +
    style.css +
    avatar.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'steps-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [h.Style({ inlineSize: width })],
          [
            Steps.view(
              {
                label: 'Sign up',
                steps: more.steps?.(h) ?? steps,
                current: 1,
                progress: more.progress,
                style,
              },
              h,
            ),
            ...(more.avatar === undefined
              ? []
              : [Avatar.view({ name: 'Ada Lovelace', style: avatar }, h)]),
          ],
        ),
    }),
  )
}

const all = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector))
const markers = () => all('li [data-state][aria-hidden="true"]:first-child')

test('a vertical line runs from each marker to the next', async () => {
  const handle = mount('vertical', '24rem')
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    const lines = all('li > span[aria-hidden="true"]')
    expect(lines).toHaveLength(3)
    lines.forEach((line, index) => {
      const box = line.getBoundingClientRect()
      expect(Math.abs(box.top - markers()[index]!.getBoundingClientRect().bottom)).toBeLessThan(1)
      expect(Math.abs(box.bottom - markers()[index + 1]!.getBoundingClientRect().top)).toBeLessThan(
        1,
      )
    })
  } finally {
    handle.dispose()
  }
})

test('a phone-wide row shows the current label alone, clear of the markers beside it', async () => {
  const handle = mount('horizontal', '390px')
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    // A label kept for a screen reader alone is clipped to a pixel.
    const shown = all('li [data-state][aria-hidden] + span').filter(
      text => text.getBoundingClientRect().width > 1,
    )
    expect(shown.map(text => text.firstElementChild!.textContent)).toEqual(['Workspace settings'])
    // Where the words are drawn, which runs past their box when it is squeezed.
    const ink = document.createRange()
    ink.selectNodeContents(shown[0]!.firstElementChild!)
    const words = ink.getBoundingClientRect()
    // The steps share the row evenly, so a title too long for its share wraps.
    expect(words.right).toBeLessThanOrEqual(markers()[2]!.getBoundingClientRect().left)
    expect(words.left).toBeGreaterThanOrEqual(markers()[1]!.getBoundingClientRect().right)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['with', 'Card or invoice, and who on the team pays for it every month'],
  ['without', undefined],
])(
  'a cramped row draws the current words, %s a description, on a line of their own under it',
  async (_, description) => {
    const handle = mount('horizontal', '15rem', {
      selection: { size: 'md' },
      steps: () => [
        { title: 'Plan' },
        { title: 'Payment', ...(description === undefined ? {} : { description }) },
        { title: 'Dates' },
        { title: 'Done' },
      ],
    })
    try {
      await vi.waitFor(() => expect(markers()).toHaveLength(4))
      const row = document.querySelector('ol')!.getBoundingClientRect()
      const text = all('li')[1]!.querySelector<HTMLElement>('[data-state] + span')!
      const box = text.getBoundingClientRect()
      const lowest = Math.max(...markers().map(marker => marker.getBoundingClientRect().bottom))
      expect(box.top).toBeGreaterThan(lowest)
      expect(box.left).toBeCloseTo(row.left, 0)
      expect(box.width).toBeCloseTo(row.width, 0)
      // One line each, a long one cut short.
      for (const words of Array.from(text.children)) {
        const ink = document.createRange()
        ink.selectNodeContents(words)
        expect(ink.getBoundingClientRect().height).toBeLessThan(
          parseFloat(getComputedStyle(words).lineHeight) * 1.5,
        )
      }
      const lines = all('li > span[aria-hidden="true"]').map(
        line => line.getBoundingClientRect().width,
      )
      expect(lines).toHaveLength(3)
      for (const width of lines) expect(width).toBeCloseTo(lines[0]!, 0)
      // The row holds them, so what follows it starts below their last line.
      expect(row.bottom).toBeGreaterThanOrEqual(box.bottom - 0.5)
      expect(row.bottom - box.bottom).toBeLessThan(4)
    } finally {
      handle.dispose()
    }
  },
)

test.each(['xs', 'sm', 'md', 'lg'] as const)(
  'a %s marker is the Avatar of that size',
  async size => {
    const handle = mount('horizontal', '40rem', { selection: { size }, avatar: size })
    try {
      await vi.waitFor(() => expect(markers()).toHaveLength(4))
      const disc = document.querySelector('[role="img"]')
      if (!(disc instanceof HTMLElement)) throw new Error('no avatar')
      const marker = markers()[0]!.getBoundingClientRect()
      expect(marker.width).toBeCloseTo(disc.getBoundingClientRect().width, 1)
      expect(marker.height).toBeCloseTo(disc.getBoundingClientRect().height, 1)
    } finally {
      handle.dispose()
    }
  },
)

test('the content of a vertical step is no larger than its title', async () => {
  const handle = mount('vertical', '24rem', {
    steps: h => [
      { title: 'Account', content: h.p([], ['Your name and your email.']) },
      { title: 'Plan', content: h.p([], ['Pick a tier.']) },
    ],
  })
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(2))
    const title = all('li [data-state][aria-hidden] + span > span')[0]!
    const content = all('li > div[data-state]')[0]!
    expect(content.textContent).toBe('Your name and your email.')
    expect(parseFloat(getComputedStyle(content).fontSize)).toBeLessThanOrEqual(
      parseFloat(getComputedStyle(title).fontSize),
    )
  } finally {
    handle.dispose()
  }
})

test.each(['horizontal', 'vertical'] as const)(
  'a %s Progress connector fills after a complete step, and by the share done after the current one',
  async orientation => {
    const handle = mount(orientation, '32rem', {
      selection: { connector: 'progress' },
      progress: 0.5,
    })
    try {
      await vi.waitFor(() => expect(markers()).toHaveLength(4))
      const lines = all('li > span[aria-hidden="true"]')
      const along = orientation === 'horizontal' ? 'width' : 'height'
      const across = orientation === 'horizontal' ? 'height' : 'width'
      // The Progress bar's track, thicker than a line.
      expect(lines[0]!.getBoundingClientRect()[across]).toBeCloseTo(8, 0)
      const share = (line: HTMLElement) =>
        parseFloat(getComputedStyle(line, '::before')[along]) / line.getBoundingClientRect()[along]
      await vi.waitFor(() => expect(share(lines[0]!)).toBeCloseTo(1, 2))
      expect(share(lines[1]!)).toBeCloseTo(0.5, 2)
      expect(share(lines[2]!)).toBe(0)
    } finally {
      handle.dispose()
    }
  },
)

test('a dot marker is the dot of a Badge, its number hidden', async () => {
  const handle = mount('horizontal', '40rem', { selection: { marker: 'dot' } })
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    const dot = getComputedStyle(markers()[2]!, '::before')
    expect(dot.width).toBe('8px')
    expect(dot.height).toBe('8px')
    expect(getComputedStyle(markers()[2]!).color).toBe('rgba(0, 0, 0, 0)')
  } finally {
    handle.dispose()
  }
})

// How far right a node's words are painted: their own extent, cut at the box
// of it or of each ancestor in its step that clips what overflows it.
const paintedRight = (element: HTMLElement) => {
  const ink = document.createRange()
  ink.selectNodeContents(element)
  let right = ink.getBoundingClientRect().right
  for (
    let at: HTMLElement | null = element;
    at !== null && at.tagName !== 'LI';
    at = at.parentElement
  )
    if (getComputedStyle(at).overflowX !== 'visible')
      right = Math.min(right, at.getBoundingClientRect().right)
  return right
}

test.each([
  ['as narrow as a phone gives it, a short title keeps its word', '18rem', 'Upload'],
  [
    'as narrow as a phone gives it, a title longer than its cap is cut short',
    '18rem',
    'Electroencephalographically',
  ],
  [
    'wide enough for every label, a title longer than its share is cut short',
    '34rem',
    'Electroencephalographically',
  ],
])('in a row %s and stops before its connector', async (_, width, current) => {
  const handle = mount('horizontal', width, {
    selection: { size: 'md', connector: 'progress' },
    steps: () => [{ title: 'Choose' }, { title: current }, { title: 'Process' }, { title: 'Done' }],
  })
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    const item = all('li')[1]!
    const title = item.querySelector<HTMLElement>('[data-state] + span > span')!
    const connector = item.querySelector<HTMLElement>(':scope > span[aria-hidden="true"]')!
    expect(title.textContent).toBe(current)
    expect(title.getBoundingClientRect().width).toBeGreaterThan(0)
    expect(paintedRight(title)).toBeLessThanOrEqual(connector.getBoundingClientRect().left)
    // A short word is whole; one longer than the cap is cut at the text's edge.
    // Against the word's own width, set free: a clipping box reports no
    // overflow, and its ellipsis fits the box.
    const free = document.createElement('span')
    free.style.font = getComputedStyle(title).font
    free.style.position = 'absolute'
    free.textContent = current
    document.body.append(free)
    const whole = free.getBoundingClientRect().width
    free.remove()
    const shown = Math.min(
      title.getBoundingClientRect().width,
      title.parentElement!.getBoundingClientRect().width,
    )
    expect(shown >= whole - 0.5).toBe(current === 'Upload')
  } finally {
    handle.dispose()
  }
})

test.each(['26rem', '30rem'])(
  'in a row %s wide, the markers stay evenly spaced around the one label shown',
  async width => {
    const handle = mount('horizontal', width)
    try {
      await vi.waitFor(() => expect(markers()).toHaveLength(4))
      const lefts = markers().map(marker => marker.getBoundingClientRect().left)
      const gaps = lefts.slice(1).map((left, index) => left - lefts[index]!)
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 0)
      // The row keeps inside its container.
      const row = document.querySelector('ol')!
      expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
    } finally {
      handle.dispose()
    }
  },
)

// Where a marker's middle is painted: a dot's own box, else the marker's.
const markerMiddle = (marker: HTMLElement) => {
  const box = marker.getBoundingClientRect()
  const dot = getComputedStyle(marker, '::before')
  if (dot.content === 'none' || dot.content === 'normal') return box.top + box.height / 2
  const top = parseFloat(dot.top) + parseFloat(dot.marginTop)
  return (
    box.top + parseFloat(getComputedStyle(marker).borderTopWidth) + top + parseFloat(dot.height) / 2
  )
}

test.each(
  (['number', 'dot'] as const).flatMap(marker =>
    ([undefined, 'xs', 'sm', 'md', 'lg'] as const).map(size => [marker, size] as const),
  ),
)('a %s marker of size %s has its connector through its middle', async (marker, size) => {
  const handle = mount('horizontal', '40rem', {
    selection: size === undefined ? { marker } : { marker, size },
  })
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    const lines = all('li > span[aria-hidden="true"]')
    expect(lines).toHaveLength(3)
    lines.forEach((line, index) => {
      const box = line.getBoundingClientRect()
      expect(box.top + box.height / 2).toBeCloseTo(markerMiddle(markers()[index]!), 0)
    })
  } finally {
    handle.dispose()
  }
})

test.each(['Georgia, serif', 'system-ui, sans-serif'])(
  'in %s, a number sits in the middle of its marker, trimmed to its figure',
  async font => {
    const handle = mount('horizontal', '40rem', { selection: { size: 'md' } })
    document.body.style.fontFamily = font
    try {
      await vi.waitFor(() => expect(markers()).toHaveLength(4))
      const marker = markers()[2]!
      const number = marker.querySelector<HTMLElement>('[data-number]')!
      const box = number.getBoundingClientRect()
      const around = marker.getBoundingClientRect()
      expect(box.top + box.height / 2).toBeCloseTo(around.top + around.height / 2, 0)
      // Trimmed to the cap line and the baseline: a face's caps stand about
      // 0.7em, where the untrimmed box is the whole em of its line height. The
      // ink of a figure that stands past the caps, or dips as Georgia's
      // oldstyle 3 does, is the face's own.
      const em = parseFloat(getComputedStyle(number).fontSize)
      expect(box.height).toBeLessThan(em * 0.85)
      expect(box.height).toBeGreaterThan(em * 0.55)
    } finally {
      handle.dispose()
      document.body.style.removeProperty('font-family')
    }
  },
)

test.each(['sm', 'lg'] as const)('a %s marker draws its check to its size', async size => {
  const handle = mount('horizontal', '40rem', { selection: { size } })
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    const marker = markers()[0]!
    const check = getComputedStyle(marker, '::after')
    expect(parseFloat(check.height)).toBeCloseTo(marker.getBoundingClientRect().height * 0.4, 0)
  } finally {
    handle.dispose()
  }
})

test('a check keeps its stroke when the borders thicken', async () => {
  // The border scale is declared at the root: thicken it there. This sheet
  // has no palette, so the check's ink is given too, or its border is invalid.
  document.documentElement.style.setProperty('--fk-border-thick', '4px')
  document.documentElement.style.setProperty('--fk-accent-on-fill', 'white')
  const handle = mount('horizontal', '40rem')
  try {
    await vi.waitFor(() => expect(markers()).toHaveLength(4))
    expect(getComputedStyle(markers()[0]!, '::after').borderRightWidth).toBe('2px')
  } finally {
    handle.dispose()
    document.documentElement.style.removeProperty('--fk-border-thick')
    document.documentElement.style.removeProperty('--fk-accent-on-fill')
  }
})
