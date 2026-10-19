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
import { userEvent } from 'vitest/browser'
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

const mount = (selection: Selection = {}) => {
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
    ':root{--fk-knob-motion:0}'
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
        model: { open: Accordion.toggled(model.open, message.id) },
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
