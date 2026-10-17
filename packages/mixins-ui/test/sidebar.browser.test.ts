/**
 * The sidebar on a real runtime: a branch opens its links beneath it; under
 * `Sidebar.fluid` the marker sits behind the current link and glides to a
 * new one; collapsed it leaves the page or shrinks to a rail of icons, where
 * a row's name shows in a tooltip beside it; `width: 'fill'` takes what
 * holds it; and on a phone only its opener shows, which opens the navigation
 * in a Sheet that a link followed closes.
 */
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { DialogSlots } from '../src/dialog.js'
import { Sheet as SheetRecipe } from '../src/recipes/sheet.js'
import { Sidebar as SidebarRecipe } from '../src/recipes/sidebar.js'
import { Tooltip as TooltipRecipe } from '../src/recipes/tooltip.js'
import * as Sidebar from '../src/sidebar.js'
import { SidebarSlots } from '../src/sidebar.js'
import { TooltipSlots } from '../src/tooltip.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const tooltip = Style.forSlots(TooltipSlots)(TooltipRecipe({}))
const sheet = Style.forSlots(DialogSlots)(SheetRecipe({}))

const Model = Schema.Struct({ sidebar: Sidebar.Model, page: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  GotSidebar: { message: Sidebar.Message },
  Went: { page: Schema.String },
})
type Message = typeof Message.Type
const got = (message: Sidebar.Message) => Message.GotSidebar({ message })

const groupsAt = (
  current: string,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Sidebar.SidebarGroup> => [
  {
    id: 'main',
    rows: ['Inbox', 'Calendar'].map(label => ({
      id: label.toLowerCase(),
      label,
      href: `#${label.toLowerCase()}`,
      current: label === current,
      icon: h.span([], ['•']),
    })),
  },
  {
    id: 'work',
    title: 'Work',
    rows: [
      {
        id: 'projects',
        label: 'Projects',
        items: [
          { label: 'Website', href: '#website' },
          { label: 'Mobile', href: '#mobile' },
        ],
      },
    ],
  },
]

afterEach(async () => {
  await page.viewport(1440, 900)
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Fixture {
  readonly collapse?: 'offcanvas' | 'icons'
  readonly collapsed?: boolean
  readonly direction?: 'ltr' | 'rtl'
  readonly recipe?: Parameters<typeof SidebarRecipe>[0]
  /** The width of the box around it, centred on the page so a tooltip has room on either side. */
  readonly width?: string
}

const mount = (fixture: Fixture = {}) => {
  const style = Style.forSlots(SidebarSlots)(SidebarRecipe(fixture.recipe ?? {}))
  const css = document.createElement('style')
  css.dataset['test'] = ''
  css.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) +
    style.css +
    tooltip.css +
    sheet.css +
    // Nothing that would measure again, so only the change under test moves anything.
    '* { transition: none !important; }'
  document.head.append(css)
  const box = document.createElement('div')
  if (fixture.width !== undefined)
    box.style.cssText = `width: ${fixture.width}; margin-inline: auto`
  const container = document.createElement('div')
  container.id = 'sidebar-browser'
  box.append(container)
  document.body.append(box)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          sidebar: Sidebar.init({
            id: 'app',
            rows: ['inbox', 'calendar', 'projects'],
            collapsed: fixture.collapsed ?? false,
            open: ['work'],
          }),
          page: 'Inbox',
        },
      }),
      update: (model: Model, message: Message): Return<Model, Message> =>
        Message.match(message, {
          GotSidebar: ({ message }) => {
            const next = Sidebar.update(model.sidebar, message)
            return {
              model:
                next.model === model.sidebar
                  ? model
                  : modifyFields(model, { sidebar: () => next.model }),
              commands: mapMessages(next.commands ?? [], got),
            }
          },
          Went: ({ page }) => ({ model: modifyFields(model, { page: () => page }) }),
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            Sidebar.view(
              {
                model: model.sidebar,
                onMessage: got,
                label: 'Workspace',
                groups: groupsAt(model.page, h),
                ...(fixture.collapse === undefined ? {} : { collapse: fixture.collapse }),
                ...(fixture.direction === undefined ? {} : { direction: fixture.direction }),
                style,
                mixins: Sidebar.fluid,
                tooltip: [tooltip.mixin],
                sheet: [sheet.mixin],
              },
              h,
            ),
            h.button([h.OnClick(Message.Went({ page: 'Calendar' }))], ['Go to Calendar']),
          ],
        ),
    }),
  )
}

const link = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('a')).find(each =>
    each.textContent?.includes(name),
  )!
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('button')).find(
    each => each.textContent?.includes(name) || each.getAttribute('aria-label') === name,
  )!
const rect = (element: Element) => element.getBoundingClientRect()
const nav = () => document.querySelector<HTMLElement>('nav')!
const marker = () => nav().children[0] as HTMLElement

test('a branch opens its links beneath it, and shuts them again', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(button('Projects')).toBeTruthy())
    const nested = () => document.getElementById(button('Projects').getAttribute('aria-controls')!)!
    expect(rect(nested()).height).toBe(0)
    await userEvent.click(button('Projects'))
    await vi.waitFor(() => {
      expect(rect(nested()).height).toBeGreaterThan(40)
      expect(rect(link('Website')).top).toBeGreaterThanOrEqual(rect(button('Projects')).bottom - 1)
    })
    await userEvent.click(button('Projects'))
    await vi.waitFor(() => expect(rect(nested()).height).toBe(0))
  } finally {
    handle.dispose()
  }
})

test('under Sidebar.fluid the marker sits behind the current link and goes to a new one', async () => {
  const handle = mount()
  try {
    const behind = (name: string) => {
      const over = rect(marker())
      const under = rect(link(name))
      return Math.abs(over.top - under.top) < 1 && Math.abs(over.width - under.width) < 1
    }
    await vi.waitFor(() => expect(behind('Inbox')).toBe(true))
    // The link's own fill gives way to the marker.
    expect(getComputedStyle(link('Inbox')).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    button('Go to Calendar').click()
    await vi.waitFor(() => expect(behind('Calendar')).toBe(true))
  } finally {
    handle.dispose()
  }
})

test('collapsed off the page, the navigation takes no room and no focus', async () => {
  const handle = mount({ collapsed: true })
  try {
    await vi.waitFor(() => expect(nav()).toBeTruthy())
    expect(rect(nav()).width).toBe(0)
    expect(nav().inert).toBe(true)
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  'collapsed to a rail (%s), the rows are their icons, named in a tooltip beside them',
  async direction => {
    document.documentElement.dir = direction
    const handle = mount({ collapsed: true, collapse: 'icons', direction, width: '20rem' })
    try {
      await vi.waitFor(() => expect(link('Inbox')).toBeTruthy())
      const row = rect(link('Inbox'))
      expect(Math.abs(row.width - row.height)).toBeLessThan(1)
      expect(Math.abs(rect(nav()).width - row.width)).toBeLessThan(1)
      link('Calendar').focus()
      const tip = await vi.waitFor(() => {
        const found = document.querySelector<HTMLElement>('[role="tooltip"]')
        expect(found).not.toBeNull()
        expect(getComputedStyle(found!).visibility).toBe('visible')
        return found!
      })
      expect(tip.textContent).toBe('Calendar')
      await vi.waitFor(() => {
        if (direction === 'ltr')
          expect(rect(tip).left).toBeGreaterThanOrEqual(rect(link('Calendar')).right)
        else expect(rect(tip).right).toBeLessThanOrEqual(rect(link('Calendar')).left)
      })
    } finally {
      handle.dispose()
      document.documentElement.removeAttribute('dir')
    }
  },
)

test('a branch pressed in a rail expands the sidebar with it open', async () => {
  const handle = mount({ collapsed: true, collapse: 'icons' })
  try {
    await vi.waitFor(() => expect(button('Projects')).toBeTruthy())
    button('Projects').click()
    await vi.waitFor(() => {
      expect(rect(nav()).width).toBeGreaterThan(200)
      expect(rect(link('Website')).height).toBeGreaterThan(0)
    })
  } finally {
    handle.dispose()
  }
})

test("width: 'fill' takes the width of what holds it", async () => {
  const handle = mount({ recipe: { width: 'fill' }, width: '25rem' })
  try {
    await vi.waitFor(() => expect(nav()).toBeTruthy())
    expect(Math.abs(rect(nav().parentElement!).width - 400)).toBeLessThan(1)
    expect(rect(nav()).width).toBeGreaterThan(300)
  } finally {
    handle.dispose()
  }
})

test('on a phone only the opener shows, and it opens the navigation in a Sheet', async () => {
  await page.viewport(390, 800)
  const handle = mount()
  try {
    await vi.waitFor(() => expect(button('Open Workspace')).toBeTruthy())
    expect(getComputedStyle(nav()).display).toBe('none')
    expect(getComputedStyle(button('Hide Workspace')).display).toBe('none')
    await userEvent.click(button('Open Workspace'))
    const dialog = await vi.waitFor(() => {
      const found = document.querySelector<HTMLDialogElement>('dialog[open]')
      expect(found).not.toBeNull()
      return found!
    })
    const inSheet = Array.from(dialog.querySelectorAll('a')).find(each =>
      each.textContent?.includes('Calendar'),
    )!
    expect(rect(inSheet).width).toBeGreaterThan(0)
    await userEvent.click(inSheet)
    await vi.waitFor(() => expect(document.querySelector('dialog[open]')).toBeNull())
  } finally {
    handle.dispose()
  }
})
