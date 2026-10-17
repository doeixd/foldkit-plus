/**
 * The navigation menu on a real runtime, per the APG's disclosure
 * navigation: a trigger shows its panel below it in the top layer, out of
 * an ancestor's overflow; ArrowDown enters the panel, the arrows walk its
 * links and Escape returns to the trigger; the arrows, Home and End walk
 * the top-level row, swapped right to left; a press outside and focus
 * leaving hide the panel. In a column the panels open beside it. Under
 * `Nav.fluid` the indicator marks the trigger whose panel holds the current
 * page, as a line or a pill, and the hover leaves the panel's links alone.
 */
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as Nav from '../src/nav.js'
import { NavSlots } from '../src/nav.js'
import { Nav as NavRecipe } from '../src/recipes/nav.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const Model = Schema.Struct({ nav: Nav.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotNav: { message: Nav.Message } })
type Message = typeof Message.Type
const got = (message: Nav.Message) => Message.GotNav({ message })

const entries: ReadonlyArray<Nav.NavEntry> = [
  { label: 'Home', href: '#home' },
  {
    id: 'products',
    label: 'Products',
    groups: [
      {
        title: 'Build',
        links: [
          { label: 'Mixins', href: '#mixins', description: 'Slots, styles and behaviors.' },
          { label: 'Remote', href: '#remote', description: 'Server facts, cached.', current: true },
        ],
      },
      { title: 'Run', links: [{ label: 'Sync', href: '#sync' }] },
    ],
  },
  { id: 'docs', label: 'Docs', groups: [{ links: [{ label: 'Guides', href: '#guides' }] }] },
  { label: 'Blog', href: '#blog' },
]

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
  document.documentElement.removeAttribute('dir')
})

interface Fixture {
  readonly orientation?: 'horizontal' | 'vertical'
  readonly direction?: 'ltr' | 'rtl'
  readonly recipe?: Parameters<typeof NavRecipe>[0]
  readonly fluid?: boolean
  /** Draws the menu in a short box that clips what overflows it. */
  readonly clipped?: boolean
  /** Draws the menu in the middle of the page, with room for a panel on either side. */
  readonly centred?: boolean
}

const mount = (fixture: Fixture = {}) => {
  const style = Style.forSlots(NavSlots)(NavRecipe(fixture.recipe ?? {}))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css +
    '* { transition: none !important; } body { margin: 0; padding: 2rem; }'
  document.head.append(sheet)
  if (fixture.direction !== undefined) document.documentElement.dir = fixture.direction
  const box = document.createElement('div')
  if (fixture.clipped === true) box.style.cssText = 'overflow: hidden; height: 3rem; width: 30rem'
  if (fixture.centred === true) box.style.cssText = 'width: 10rem; margin-inline: auto'
  const container = document.createElement('div')
  container.id = 'nav-menu'
  box.append(container)
  const outside = document.createElement('button')
  outside.textContent = 'Outside'
  document.body.append(box, outside)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { nav: Nav.init('site') } }),
      update: (model: Model, { message }: Message) => {
        const next = Nav.update(model.nav, message)
        return {
          model: next.model === model.nav ? model : modifyFields(model, { nav: () => next.model }),
          commands: mapMessages(next.commands ?? [], got),
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        Nav.view(
          {
            model: model.nav,
            entries,
            label: 'Site',
            onMessage: got,
            ...(fixture.orientation === undefined ? {} : { orientation: fixture.orientation }),
            ...(fixture.direction === undefined ? {} : { direction: fixture.direction }),
            mixins: [style.mixin, ...(fixture.fluid === true ? Nav.fluid : [])],
          },
          h,
        ),
    }),
  )
  return { handle, outside }
}

const byText = (text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('a, button')).find(
    each => each.textContent?.startsWith(text) === true,
  )!
const panel = () => document.querySelector<HTMLElement>('[data-nav-panel]')
const rect = (element: Element) => element.getBoundingClientRect()
const shown = () => panel()?.matches(':popover-open') === true

test('a trigger shows its panel below it in the top layer, out of its box, and hides it again', async () => {
  const { handle } = mount({ clipped: true })
  try {
    await vi.waitFor(() => expect(byText('Products')).toBeTruthy())
    await userEvent.click(byText('Products'))
    await vi.waitFor(() => {
      expect(byText('Products').getAttribute('aria-expanded')).toBe('true')
      expect(shown()).toBe(true)
      expect(rect(panel()!).top).toBeGreaterThanOrEqual(rect(byText('Products')).bottom)
    })
    // Past the clipping box, and what a press there lands on.
    const box = rect(byText('Mixins'))
    expect(document.elementFromPoint(box.left + 4, box.top + box.height / 2)?.closest('a')).toBe(
      byText('Mixins'),
    )
    await userEvent.click(byText('Products'))
    await vi.waitFor(() => expect(panel()).toBeNull())
  } finally {
    handle.dispose()
  }
})

test('ArrowDown enters the panel, the arrows walk its links, Escape returns to the trigger', async () => {
  const { handle } = mount()
  try {
    await vi.waitFor(() => expect(byText('Products')).toBeTruthy())
    byText('Products').focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(byText('Mixins')))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(byText('Remote')))
    // Across the panel's groups, one line of links.
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(byText('Sync')))
    await userEvent.keyboard('{Home}')
    await vi.waitFor(() => expect(document.activeElement).toBe(byText('Mixins')))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => {
      expect(panel()).toBeNull()
      expect(document.activeElement).toBe(byText('Products'))
    })
  } finally {
    handle.dispose()
  }
})

test.each([
  ['ltr', 'ArrowRight', 'ArrowLeft'],
  ['rtl', 'ArrowLeft', 'ArrowRight'],
] as const)(
  '%s: the arrows, Home and End walk the top-level row',
  async (direction, next, back) => {
    const { handle } = mount({ direction })
    try {
      await vi.waitFor(() => expect(byText('Home')).toBeTruthy())
      byText('Home').focus()
      await userEvent.keyboard(`{${next}}`)
      await vi.waitFor(() => expect(document.activeElement).toBe(byText('Products')))
      await userEvent.keyboard('{End}')
      await vi.waitFor(() => expect(document.activeElement).toBe(byText('Blog')))
      await userEvent.keyboard(`{${back}}`)
      await vi.waitFor(() => expect(document.activeElement).toBe(byText('Docs')))
      await userEvent.keyboard('{Home}')
      await vi.waitFor(() => expect(document.activeElement).toBe(byText('Home')))
    } finally {
      handle.dispose()
    }
  },
)

test('a press outside hides the panel, and so does focus leaving the menu', async () => {
  const { handle, outside } = mount()
  try {
    await vi.waitFor(() => expect(byText('Docs')).toBeTruthy())
    await userEvent.click(byText('Docs'))
    await vi.waitFor(() => expect(shown()).toBe(true))
    await userEvent.click(document.body, { position: { x: 600, y: 400 } })
    await vi.waitFor(() => expect(panel()).toBeNull())
    byText('Docs').focus()
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(document.activeElement).toBe(byText('Guides')))
    outside.focus()
    await vi.waitFor(() => expect(panel()).toBeNull())
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  'in a column (%s) the panel opens beside it',
  async direction => {
    const { handle } = mount({ orientation: 'vertical', direction, centred: true })
    try {
      await vi.waitFor(() => expect(byText('Products')).toBeTruthy())
      expect(rect(byText('Products')).top).toBeGreaterThan(rect(byText('Home')).bottom - 1)
      byText('Products').focus()
      // Into the panel toward the column's inline end.
      await userEvent.keyboard(direction === 'ltr' ? '{ArrowRight}' : '{ArrowLeft}')
      await vi.waitFor(() => expect(document.activeElement).toBe(byText('Mixins')))
      const list = rect(document.querySelector('ul')!)
      if (direction === 'ltr') expect(rect(panel()!).left).toBeGreaterThanOrEqual(list.right)
      else expect(rect(panel()!).right).toBeLessThanOrEqual(list.left)
    } finally {
      handle.dispose()
    }
  },
)

const indicator = () => document.querySelector('ul')!.children[0] as HTMLElement
const highlight = () => document.querySelector('ul')!.children[1] as HTMLElement

test.each([
  ['underline', (height: number) => height < 4],
  ['pill', (height: number) => height > 20],
] as const)(
  'as a %s, the indicator marks the trigger whose panel holds the current page',
  async (indicatorStyle, fits) => {
    const { handle } = mount({ fluid: true, recipe: { indicator: indicatorStyle } })
    try {
      await vi.waitFor(() => {
        const mark = rect(indicator())
        const under = rect(byText('Products'))
        expect(Math.abs(mark.left - under.left)).toBeLessThan(1)
        expect(Math.abs(mark.width - under.width)).toBeLessThan(1)
        expect(Math.abs(mark.bottom - under.bottom)).toBeLessThan(1)
        expect(fits(mark.height)).toBe(true)
      })
    } finally {
      handle.dispose()
    }
  },
)

test('the hover follows the top-level row and leaves a panel’s links alone', async () => {
  const { handle } = mount({ fluid: true })
  try {
    await vi.waitFor(() => expect(byText('Products')).toBeTruthy())
    await userEvent.click(byText('Products'))
    await vi.waitFor(() => expect(shown()).toBe(true))
    await userEvent.hover(byText('Remote'))
    await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
    const lit = rect(highlight())
    const remote = rect(byText('Remote'))
    expect(Math.abs(lit.top - remote.top) < 1 && Math.abs(lit.width - remote.width) < 1).toBe(false)
    await userEvent.hover(byText('Blog'))
    await vi.waitFor(() =>
      expect(Math.abs(rect(highlight()).left - rect(byText('Blog')).left)).toBeLessThan(1),
    )
  } finally {
    handle.dispose()
  }
})
