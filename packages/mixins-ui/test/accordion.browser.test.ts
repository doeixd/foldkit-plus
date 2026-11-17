/**
 * An accordion on a real runtime, its open sections in the Model: a press
 * opens a section's panel to its content's height and shuts it to nothing,
 * with no measured height; the chevron turns; the open title turns semibold
 * in the width it already had; a shut panel's content cannot be reached.
 * A trigger is pressed with `click()`: vitest's locator reads a steady
 * label's hidden copy into the name, which Chrome does not (`steady`). And
 * each axis of the recipe draws what it says: separators between sections
 * only, a box, cards apart, fills, a ghost's hover, the plus turning to a
 * minus, the indicator at the start, and an open section's tint.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { cdp, userEvent } from 'vitest/browser'
import { Accordion, AccordionSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
type Selection = Parameters<typeof Recipes.Accordion>[0]
const Model = Schema.Struct({ open: Schema.Array(Schema.String) })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Toggled'; readonly id: string }
const Toggled = (id: string): Message => ({ _tag: 'Toggled', id })

afterEach(async () => {
  await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = (selection: Selection = {}, still = true, single = false, extraCss = '') => {
  const style = Style.forSlots(AccordionSlots)(Recipes.Accordion(selection))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    // Still, so a size is read where it ends rather than mid-flight.
    (still ? ':root{--fk-knob-motion:0}' : '') +
    extraCss
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'accordion-browser'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ inlineSize: '20rem' })],
      [
        Accordion.view(
          {
            id: 'settings',
            items: [
              {
                id: 'billing',
                title: 'Billing',
                content: h.p([], [h.a([h.Href('#seats')], ['Seats'])]),
              },
              { id: 'team', title: 'Team', content: 'Invite, remove, and assign roles.' },
            ],
            open: model.open,
            onToggle: Toggled,
            style,
          },
          h,
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { open: [] } }),
      update: (model: Model, message: Message) => ({
        model: { open: single ? [message.id] : Accordion.toggled(model.open, message.id) },
      }),
      view,
    }),
  )
}

const trigger = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button =>
    button.textContent?.includes(name),
  )!
const panelOf = (name: string) =>
  document.getElementById(trigger(name).getAttribute('aria-controls')!)!

test('a press opens a panel to its content and shuts it to nothing', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(panelOf('Team').getBoundingClientRect().height).toBe(0)
    trigger('Team').click()
    await vi.waitFor(() =>
      expect(panelOf('Team').getBoundingClientRect().height).toBeGreaterThan(10),
    )
    expect(trigger('Team').getAttribute('aria-expanded')).toBe('true')
    trigger('Team').click()
    await vi.waitFor(() => expect(panelOf('Team').getBoundingClientRect().height).toBe(0))
  } finally {
    handle.dispose()
  }
})

const heightOf = (name: string) => panelOf(name).getBoundingClientRect().height

const gridRowsDuration = (name: string) =>
  panelOf(name)
    .getAnimations()
    .filter(animation => (animation as CSSTransition).transitionProperty === 'grid-template-rows')
    .map(animation => Number(animation.effect!.getComputedTiming().duration))

interface Frame {
  readonly heights: ReadonlyArray<number>
  readonly inert: ReadonlyArray<boolean>
  readonly durations: ReadonlyArray<ReadonlyArray<number>>
}

/** What each named panel shows, one row per frame, for `ms` from now: a poll could miss a short transition. */
const sampleFrames = (names: ReadonlyArray<string>, ms: number) =>
  new Promise<ReadonlyArray<Frame>>(resolve => {
    const frames: Array<Frame> = []
    const start = performance.now()
    const tick = () => {
      frames.push({
        heights: names.map(heightOf),
        inert: names.map(name => panelOf(name).hasAttribute('inert')),
        durations: names.map(gridRowsDuration),
      })
      if (performance.now() - start < ms) requestAnimationFrame(tick)
      else resolve(frames)
    }
    tick()
  })

/** Opens Billing, lets it settle, and returns its open height. */
const openBilling = async () => {
  await vi.waitFor(() => expect(trigger('Billing')).toBeDefined())
  trigger('Billing').click()
  await vi.waitFor(() => expect(heightOf('Billing')).toBeGreaterThan(5))
  await vi.waitFor(() => expect(document.getAnimations()).toHaveLength(0))
  return heightOf('Billing')
}

/** Opens Billing, then presses Team in a single-open accordion and watches both panels. */
// Slowed, so a loaded runner still draws several frames of it.
const switchTo = async (extraCss = ':root{--fk-knob-motion:3}') => {
  const handle = mount({}, false, true, extraCss)
  const full = await openBilling()
  trigger('Team').click()
  const frames = await sampleFrames(['Billing', 'Team'], 1200)
  await vi.waitFor(() => expect(document.getAnimations()).toHaveLength(0))
  return { handle, full, frames }
}

const firstDuration = (frames: ReadonlyArray<Frame>, panel: 0 | 1) =>
  frames.map(frame => frame.durations[panel]![0]).find(duration => duration !== undefined)

test('opening another section shuts the open one over the same time, the two moving together', async () => {
  const { handle, full, frames } = await switchTo()
  try {
    // Mid-way both are partly open at once: the total never jumps.
    expect(
      frames.some(
        ({ heights: [billing, team] }) => billing! > 1 && billing! < full - 1 && team! > 1,
      ),
    ).toBe(true)
    const last = frames[frames.length - 1]!
    expect(last.heights[0]).toBe(0)
    expect(last.heights[1]).toBeGreaterThan(5)
    // Several frames of motion, not one jump.
    expect(
      frames.filter(({ heights: [billing] }) => billing! > 1 && billing! < full - 1).length,
    ).toBeGreaterThan(2)
  } finally {
    handle.dispose()
  }
})

test('the shutting panel and the opening one run for the same duration', async () => {
  const { handle, frames } = await switchTo()
  try {
    const opening = firstDuration(frames, 1)
    expect(opening).toBeGreaterThan(0)
    expect(firstDuration(frames, 0)).toBe(opening)
  } finally {
    handle.dispose()
  }
})

test('--fk-collapse-close-duration sets the shutting time alone, --fk-collapse-duration both', async () => {
  const { handle, frames } = await switchTo(
    ':root{--fk-collapse-duration:200ms;--fk-collapse-close-duration:300ms}',
  )
  try {
    expect(firstDuration(frames, 1)).toBe(200)
    expect(firstDuration(frames, 0)).toBe(300)
  } finally {
    handle.dispose()
  }
})

test('the shutting panel takes no focus from its first frame, while it is still shutting', async () => {
  const { handle, full, frames } = await switchTo()
  try {
    const shutting = frames.filter(({ heights: [billing] }) => billing! > 0 && billing! < full)
    expect(shutting.length).toBeGreaterThan(0)
    expect(shutting.every(frame => frame.inert[0])).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('with the motion knob at 0 the switch is immediate', async () => {
  const handle = mount({}, true, true)
  try {
    const full = await openBilling()
    trigger('Team').click()
    const frames = await sampleFrames(['Billing', 'Team'], 200)
    // Every frame is a whole state: the old section either open or gone, never between.
    for (const { heights } of frames) expect([0, full]).toContain(heights[0])
    expect(frames[frames.length - 1]!.heights[0]).toBe(0)
    expect(document.getAnimations()).toHaveLength(0)
  } finally {
    handle.dispose()
  }
})

test('the chevron turns a quarter as the section opens', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    const chevron = () =>
      getComputedStyle(trigger('Team').querySelector('[aria-hidden="true"]')!).rotate
    expect(chevron()).toBe('-45deg')
    trigger('Team').click()
    await vi.waitFor(() => expect(chevron()).toBe('45deg'))
  } finally {
    handle.dispose()
  }
})

test('the open title is semibold in the width it had shut', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Billing')).toBeDefined())
    const label = () => trigger('Billing').querySelector('[data-label]')!
    const shut = label().getBoundingClientRect().width
    trigger('Billing').click()
    await vi.waitFor(() => expect(getComputedStyle(label()).fontWeight).toBe('600'))
    expect(label().getBoundingClientRect().width).toBe(shut)
  } finally {
    handle.dispose()
  }
})

test('a shut panel takes no focus: Tab passes from its trigger to the next', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(trigger('Billing')).toBeDefined())
    trigger('Billing').focus()
    await userEvent.tab()
    // The link inside the shut Billing panel is skipped.
    expect(document.activeElement).toBe(trigger('Team'))
  } finally {
    handle.dispose()
  }
})

const item = (name: string) => trigger(name).parentElement!.parentElement!
const css = (element: Element, pseudo?: string) => getComputedStyle(element, pseudo)
const clear = 'rgba(0, 0, 0, 0)'

test('separators draw a line between sections only, and none when off', async () => {
  const on = mount()
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(css(item('Billing')).borderTopWidth).toBe('0px')
    expect(css(item('Team')).borderTopWidth).toBe('1px')
    expect(css(item('Team')).borderBottomWidth).toBe('0px')
  } finally {
    on.dispose()
  }
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  const off = mount({ separators: 'off' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(css(item('Team')).borderTopWidth).toBe('0px')
  } finally {
    off.dispose()
  }
})

test('bordered draws one box, its words clear of its edge', async () => {
  const handle = mount({ variant: 'bordered' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    const root = item('Billing').parentElement!
    expect(css(root).borderTopWidth).toBe('1px')
    expect(parseFloat(css(trigger('Team')).paddingLeft)).toBeGreaterThan(0)
    expect(css(item('Team')).borderTopWidth).toBe('1px')
  } finally {
    handle.dispose()
  }
})

test('separated draws each section a card apart, with no line between', async () => {
  const handle = mount({ variant: 'separated' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    const gap =
      item('Team').getBoundingClientRect().top - item('Billing').getBoundingClientRect().bottom
    expect(gap).toBeGreaterThan(4)
    expect(css(item('Team')).boxShadow).toContain('inset')
    expect(css(item('Team')).borderTopColor).toBe(clear)
    expect(parseFloat(css(trigger('Team')).paddingLeft)).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})

test('filled puts each section on a fill, with no line between', async () => {
  const handle = mount({ variant: 'filled' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(css(item('Team')).backgroundColor).not.toBe(clear)
    expect(css(item('Team')).borderTopColor).toBe(clear)
  } finally {
    handle.dispose()
  }
})

test('a ghost row fills under the pointer and nowhere else', async () => {
  const handle = mount({ variant: 'ghost', separators: 'off' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(css(trigger('Team')).backgroundColor).toBe(clear)
    // At its place, not by its name, which vitest reads with the steady label's copy.
    const box = trigger('Team').getBoundingClientRect()
    await userEvent.hover(document.body, {
      position: { x: box.left + box.width / 2, y: box.top + box.height / 2 },
    })
    await vi.waitFor(() => expect(css(trigger('Team')).backgroundColor).not.toBe(clear))
    expect(css(trigger('Billing')).backgroundColor).toBe(clear)
  } finally {
    handle.dispose()
  }
})

test('the plus lies flat into a minus as its section opens, the box itself still', async () => {
  const handle = mount({ indicator: 'plus' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    const plus = () => trigger('Team').querySelector('[aria-hidden="true"]')!
    expect(css(plus()).rotate).toBe('0deg')
    expect(css(plus()).borderRightWidth).toBe('0px')
    expect(css(plus(), '::before').rotate).toBe('0deg')
    expect(css(plus(), '::after').rotate).toBe('90deg')
    trigger('Team').click()
    await vi.waitFor(() => expect(css(plus(), '::after').rotate).toBe('0deg'))
    expect(css(plus()).rotate).toBe('0deg')
  } finally {
    handle.dispose()
  }
})

test('the indicator at the start sits before the words', async () => {
  const handle = mount({ indicatorPosition: 'start' })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    const mark = trigger('Team').querySelector('[aria-hidden="true"]')!.getBoundingClientRect()
    const words = trigger('Team').querySelector('[data-label]')!.getBoundingClientRect()
    expect(mark.right).toBeLessThanOrEqual(words.left)
    expect(mark.left - trigger('Team').getBoundingClientRect().left).toBeLessThan(4)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['item', 'the section', (name: string) => item(name)],
  ['trigger', 'its row', (name: string) => trigger(name)],
] as const)('active %s tints %s while open', async (active, _, tinted) => {
  const handle = mount({ active })
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    expect(css(tinted('Team')).backgroundColor).toBe(clear)
    trigger('Team').click()
    await vi.waitFor(() => expect(css(tinted('Team')).backgroundColor).not.toBe(clear))
    expect(css(tinted('Billing')).backgroundColor).toBe(clear)
  } finally {
    handle.dispose()
  }
})

const preferReducedMotion = (value: 'reduce' | 'no-preference') =>
  cdp().send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value }],
  })

// The first duration is the row's travel; the second is the fade, which stays.
test.each([
  ['reduced motion', 'reduce', false, '0s'],
  ['a still theme', 'no-preference', true, '0s'],
  ['the default motion', 'no-preference', false, null],
] as const)('the panel row slides under %s', async (_name, preference, still, expected) => {
  const handle = mount({}, still)
  try {
    await vi.waitFor(() => expect(trigger('Team')).toBeDefined())
    await userEvent.hover(document.body, { position: { x: 1, y: 1 } })
    await preferReducedMotion(preference)
    const travel = () => getComputedStyle(panelOf('Team')).transitionDuration.split(', ')[0]!
    if (expected === null) expect(parseFloat(travel())).toBeGreaterThan(0)
    else await vi.waitFor(() => expect(travel()).toBe(expected))
  } finally {
    await preferReducedMotion('no-preference')
    handle.dispose()
  }
})
