/**
 * A Menu's header, footer, row content and anchor, placed as an application
 * places it (`Bundles.Menu` as a child that reports `Selected`): the bands
 * stand above and below the rows and are no row, a row's content shows in
 * place of its words while its label stays the name, the panel opens where
 * `anchor` says, and a configured Menu draws with its base.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Bundles, Menu, MenuSlots, Recipes } from '../src/index.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const rows: ReadonlyArray<Menu.Row> = [
  { value: 'profile', label: 'Profile' },
  { value: 'billing', label: 'Billing' },
  { value: 'out', label: 'Sign out', tone: 'destructive' },
]

const App = Bundle.compose({ chosen: Schema.String }).pipe(
  Bundle.withChild('menu', Bundles.Menu, {
    args: { id: 'account', rows },
    onOut: out => model => ({
      model: { ...model, chosen: out.value },
    }),
  }),
)

const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))

const mount = (
  more: {
    readonly header?: boolean
    readonly footer?: boolean
    readonly content?: boolean
    readonly anchor?: Menu.MenuViewOptions<never>['anchor']
    readonly configured?: boolean
  } = {},
) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('theme', Theme.root(Theme.standard(Theme.make({})))),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'menu-family'
  document.body.append(container)
  const Account = Menu.configure({
    base: { mixins: [style.mixin] },
    presets: { low: { anchor: { gap: 30 } } },
  })
  return Runtime.embed(
    Runtime.makeElement({
      ...App.placements.runtime({ Model: App.Model, initial: { chosen: '' } }),
      container,
      view: (model, h) =>
        h.div(
          [h.Style({ paddingBlockStart: '12rem', paddingInlineStart: '2rem' })],
          [
            h.p([h.Id('chosen')], [model.chosen]),
            (more.configured === true ? Account.view : Menu.view)(
              {
                model: model.menu,
                rows:
                  more.content === true
                    ? [
                        {
                          value: 'profile',
                          label: 'Profile',
                          content: h.span([h.Id('rich')], ['Ada Lovelace']),
                        },
                        ...rows.slice(1),
                      ]
                    : rows,
                buttonContent: h.span([], ['Account']),
                onMessage: message => App.Message.GotMenuMessage({ message }),
                mixins: more.configured === true ? [] : [style.mixin],
                ...(more.configured === true ? { preset: 'low' as const } : {}),
                ...(more.anchor === undefined ? {} : { anchor: more.anchor }),
                ...(more.header === true
                  ? { header: h.span([h.Id('who')], ['ada@example.com']) }
                  : {}),
                ...(more.footer === true ? { footer: h.span([h.Id('foot')], ['v1.2']) } : {}),
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const open = async () => {
  await vi.waitFor(() => expect(document.querySelector('button')).not.toBeNull())
  await userEvent.click(document.querySelector('button')!)
  await vi.waitFor(() =>
    expect(document.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0),
  )
}

test('a header and a footer stand above and below the rows, and are no row', async () => {
  const handle = mount({ header: true, footer: true })
  try {
    await open()
    const panel = document.querySelector('[role="menu"]')!
    const items = Array.from(panel.querySelectorAll('[role="menuitem"]'))
    expect(items).toHaveLength(3)
    const who = document.getElementById('who')!.getBoundingClientRect()
    const foot = document.getElementById('foot')!.getBoundingClientRect()
    expect(who.bottom).toBeLessThanOrEqual(items[0]!.getBoundingClientRect().top)
    expect(foot.top).toBeGreaterThanOrEqual(items[2]!.getBoundingClientRect().bottom)
    expect(panel.contains(document.getElementById('who'))).toBe(true)
    expect(document.getElementById('who')!.closest('[role="menuitem"]')).toBeNull()
  } finally {
    handle.dispose()
  }
})

test('a row’s content shows in place of its words, the label staying its name', async () => {
  const handle = mount({ content: true })
  try {
    await open()
    const first = document.querySelector('[role="menuitem"]')!
    expect(first.textContent).toContain('Ada Lovelace')
    expect(first.textContent).not.toContain('Profile')
  } finally {
    handle.dispose()
  }
})

test.each([
  ['the default places the panel below the button', undefined, 'below'],
  ['top places it above', { placement: 'top-start' } as const, 'above'],
] as const)('%s', async (_, anchor, side) => {
  const handle = mount(anchor === undefined ? {} : { anchor })
  try {
    await open()
    const button = document.querySelector('button')!.getBoundingClientRect()
    const panel = document.querySelector('[role="menu"]')!.getBoundingClientRect()
    if (side === 'below') expect(panel.top).toBeGreaterThanOrEqual(button.bottom)
    else expect(panel.bottom).toBeLessThanOrEqual(button.top)
  } finally {
    handle.dispose()
  }
})

test('a configured Menu keeps its base mixins and takes the preset’s anchor gap', async () => {
  const handle = mount({ configured: true })
  try {
    await open()
    const button = document.querySelector('button')!.getBoundingClientRect()
    const panel = document.querySelector('[role="menu"]')!.getBoundingClientRect()
    expect(panel.top - button.bottom).toBeGreaterThan(24)
    expect(document.querySelector('[role="menu"]')!.className).toContain('style-')
  } finally {
    handle.dispose()
  }
})

test('choosing a row answers Selected to the application, which owns what it means', async () => {
  const handle = mount()
  try {
    await open()
    await userEvent.click(document.querySelectorAll('[role="menuitem"]')[1]!)
    await vi.waitFor(() => expect(document.getElementById('chosen')?.textContent).toBe('billing'))
  } finally {
    handle.dispose()
  }
})
