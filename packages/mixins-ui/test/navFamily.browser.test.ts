/**
 * The navigation menu's icons, panel footer and `panel: 'grid'` layout, placed
 * as an application places it (`Bundles.Nav` as a child), and `configure`: an
 * icon stands beside both lines of a panel link and before a top-level link's
 * words, hidden from assistive technology; the footer is below the groups and
 * no link; a grid panel lays its groups in equal columns.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Bundles, Nav, NavSlots, Recipes } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const App = Bundle.compose({ seen: Schema.String }).pipe(
  Bundle.withChild('nav', Bundles.Nav, { args: { id: 'site' } }),
)

const Configured = Nav.configure({
  base: { orientation: 'horizontal' },
  presets: { side: { orientation: 'vertical' } },
})

const mount = (
  more: {
    readonly selection?: Parameters<typeof Recipes.Nav>[0]
    readonly configured?: boolean
  } = {},
) => {
  const style = Style.forSlots(NavSlots)(Recipes.Nav(more.selection ?? {}))
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'nav-family'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({ Model: App.Model, initial: { seen: '' } }),
      container,
      view: (model, h) =>
        (more.configured === true ? Configured.view : Nav.view)(
          {
            model: model.nav,
            onMessage: message => App.Message.GotNavMessage({ message }),
            label: 'Site',
            ...(more.configured === true ? { preset: 'side' as const } : {}),
            mixins: [style.mixin],
            entries: [
              { label: 'Home', href: '#home', icon: h.span([h.Id('home-icon')], ['H']) },
              {
                id: 'products',
                label: 'Products',
                groups: [
                  {
                    title: 'Build',
                    links: [
                      {
                        label: 'Mixins',
                        href: '#mixins',
                        description: 'Slots and styles.',
                        icon: h.span([h.Id('mixins-icon')], ['M']),
                      },
                      { label: 'Remote', href: '#remote', description: 'Server facts.' },
                    ],
                  },
                  { title: 'Run', links: [{ label: 'Sync', href: '#sync' }] },
                ],
                footer: h.a([h.Id('learn'), h.Href('#learn')], ['Learn more']),
              },
            ],
          },
          h,
        ),
    }),
  )
}

const openProducts = async () => {
  await vi.waitFor(() => expect(document.querySelector('button[aria-expanded]')).not.toBeNull())
  await userEvent.click(document.querySelector('button[aria-expanded]')!)
  await vi.waitFor(() => expect(document.querySelector('[data-nav-panel]')).not.toBeNull())
}

test('an icon is hidden from assistive technology and stands before a top-level link’s words', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(document.getElementById('home-icon')).not.toBeNull())
    const icon = document.getElementById('home-icon')!
    expect(icon.parentElement?.getAttribute('aria-hidden')).toBe('true')
    const link = icon.closest('a')!
    expect(link.textContent).toBe('HHome')
    expect(icon.getBoundingClientRect().right).toBeLessThanOrEqual(
      link.getBoundingClientRect().right,
    )
  } finally {
    handle.dispose()
  }
})

test('a panel link’s icon stands in a column of its own, beside its words and its description', async () => {
  const handle = mount()
  try {
    await openProducts()
    const icon = document.getElementById('mixins-icon')!.getBoundingClientRect()
    const link = document.getElementById('mixins-icon')!.closest('a')!
    const title = link.querySelector(':scope > span:not([aria-hidden])')!.getBoundingClientRect()
    const description = Array.from(link.querySelectorAll('span'))
      .find(span => span.textContent === 'Slots and styles.')!
      .getBoundingClientRect()
    expect(icon.right).toBeLessThanOrEqual(title.left + 1)
    expect(description.left).toBeCloseTo(title.left, 0)
    expect(description.top).toBeGreaterThanOrEqual(title.bottom - 1)
  } finally {
    handle.dispose()
  }
})

test('the footer is drawn below the groups, in the panel, and is no panel link', async () => {
  const handle = mount()
  try {
    await openProducts()
    const learn = document.getElementById('learn')!
    const panel = document.querySelector('[data-nav-panel]')!
    expect(panel.contains(learn)).toBe(true)
    const lastLink = Array.from(panel.querySelectorAll(':scope li a')).at(-1)!
    expect(learn.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      lastLink.getBoundingClientRect().bottom,
    )
    expect(panel.querySelectorAll(':scope li a')).toHaveLength(3)
  } finally {
    handle.dispose()
  }
})

test.each([
  ['list', undefined],
  ['grid', { panel: 'grid' } as const],
] as const)('the %s panel lays its groups out', async (kind, selection) => {
  const handle = mount(selection === undefined ? {} : { selection })
  try {
    await openProducts()
    const groups = document.querySelector('[data-nav-panel] > div')!
    expect(getComputedStyle(groups).display).toBe(kind === 'grid' ? 'grid' : 'flex')
  } finally {
    handle.dispose()
  }
})

test('a configured Nav takes the preset’s orientation over its base', async () => {
  const handle = mount({ configured: true })
  try {
    await vi.waitFor(() => expect(document.querySelector('ul[data-orientation]')).not.toBeNull())
    expect(document.querySelector('ul[data-orientation]')?.getAttribute('data-orientation')).toBe(
      'vertical',
    )
  } finally {
    handle.dispose()
  }
})
