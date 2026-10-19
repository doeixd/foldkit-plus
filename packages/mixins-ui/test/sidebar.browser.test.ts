/**
 * The sidebar on a real runtime: a branch opens its links beneath it; under
 * `Sidebar.fluid` the marker sits behind the current link and glides to a
 * new one; collapsed it leaves the page or shrinks to a rail of icons, where
 * a row's name shows in a tooltip beside it; a resizable column follows a
 * drag of its edge, either way, and collapses dragged below half its least
 * width, giving the page its room; and on a phone only its opener shows,
 * which opens the navigation in a Sheet that a link followed closes.
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
      icon: h.span([h.Class('icon')], ['•']),
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
  readonly resizable?: Sidebar.InitConfig['width']
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
    '* { transition: none !important; }' +
    '.mark { display: block; width: 24px; height: 24px }'
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
            width: fixture.resizable,
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
        // A row, as a page beside a sidebar: the column takes only its own width.
        h.div(
          [h.Style({ display: 'flex', alignItems: 'flex-start' })],
          [
            Sidebar.view(
              {
                model: model.sidebar,
                onMessage: got,
                label: 'Workspace',
                groups: groupsAt(model.page, h),
                ...(fixture.collapse === undefined ? {} : { collapse: fixture.collapse }),
                ...(fixture.direction === undefined ? {} : { direction: fixture.direction }),
                header: { mark: h.span([h.Class('mark')], []), content: h.strong([], ['Acme']) },
                footer: { mark: h.span([h.Class('mark')], []), content: h.span([], ['ada@acme']) },
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

test.each(['ltr', 'rtl'] as const)(
  'collapsed to a rail (%s), its icons and the marks of its ends sit centred, and an end shows only its mark',
  async direction => {
    const handle = mount({ collapsed: true, collapse: 'icons', direction })
    try {
      await vi.waitFor(() => expect(link('Inbox')).toBeTruthy())
      const centre = (element: Element) => (rect(element).left + rect(element).right) / 2
      const rail = centre(nav())
      // The slots that hold what the application drew.
      const centred = Array.from(
        document.querySelectorAll('.icon, .mark'),
        each => each.parentElement!,
      )
      expect(centred).toHaveLength(4)
      for (const each of [...centred, button('Show Workspace')])
        expect(Math.abs(centre(each) - rail)).toBeLessThan(0.5)
      expect(rect(document.querySelector('strong')!).width).toBe(0)
    } finally {
      handle.dispose()
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

const resizeHandle = () => document.querySelector<HTMLElement>('[role="separator"]')!

/** Drags the resize handle by `dx` pixels, as a pointer would. */
const drag = (dx: number) => {
  const { left, top } = rect(resizeHandle())
  const at = (type: string, x: number) =>
    resizeHandle().dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: x, clientY: top }),
    )
  at('pointerdown', left)
  at('pointermove', left + dx)
  at('pointerup', left + dx)
}

test.each([
  ['ltr', 40],
  ['rtl', -40],
] as const)(
  '%s, a drag of %ipx widens the column, its edge under the handle',
  async (direction, dx) => {
    const handle = mount({ direction, resizable: { size: 240, min: 200, max: 400 } })
    try {
      await vi.waitFor(() => expect(Math.round(rect(nav()).width)).toBe(240))
      drag(dx)
      await vi.waitFor(() => expect(Math.round(rect(nav()).width)).toBe(280))
      const column = rect(nav().parentElement!)
      const edge = direction === 'ltr' ? column.right : column.left
      const line = rect(resizeHandle())
      expect(Math.abs((line.left + line.right) / 2 - edge)).toBeLessThan(1)
    } finally {
      handle.dispose()
    }
  },
)

test.each(['icons', 'offcanvas'] as const)(
  'dragged below half its least width, the column collapses (%s) and gives the page its room, and the toggle brings its width back',
  async collapse => {
    const handle = mount({ collapse, resizable: { size: 300, min: 200, max: 400 } })
    try {
      await vi.waitFor(() => expect(Math.round(rect(nav()).width)).toBe(300))
      const page = () => rect(button('Go to Calendar')).left
      drag(-60)
      await vi.waitFor(() => expect(Math.round(rect(nav()).width)).toBe(240))
      drag(-200)
      await vi.waitFor(() => expect(rect(nav()).width).toBeLessThan(50))
      // The page beside it moves in: no column is left at the dragged width.
      expect(page()).toBeLessThan(60)
      // Back at the width that drag began at.
      await userEvent.click(button('Show Workspace'))
      await vi.waitFor(() => expect(Math.round(rect(nav()).width)).toBe(240))
      expect(page()).toBeGreaterThan(240)
    } finally {
      handle.dispose()
    }
  },
)

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
