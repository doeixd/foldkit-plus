/**
 * A Menu's rows beyond a plain choice, on a real runtime: checkbox and radio
 * rows carry their roles and `aria-checked`, and choosing one by a click,
 * Space or Enter sets it with the menu left open, while a plain row still
 * closes it; rows of one group stand under its heading with a separator
 * between groups; a checked row shows its mark and an unchecked one none,
 * every row's words in one column; a shortcut sits at the row's end, left to
 * right even in a right-to-left menu; a destructive row is in the danger
 * ink. A Menubar's menus keep a checkbox row open too.
 */
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Menu, Menubar, MenuSlots, Recipes } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))

const State = Schema.Struct({
  grid: Schema.Boolean,
  rulers: Schema.Boolean,
  zoom: Schema.String,
  chosen: Schema.Option(Schema.String),
})
type State = typeof State.Type

const rowsOf = (state: State): ReadonlyArray<Menu.Row> => [
  { label: 'Grid', check: 'checkbox', checked: state.grid, group: 'Show', shortcut: ['⌘', 'G'] },
  { label: 'Rulers', check: 'checkbox', checked: state.rulers, group: 'Show' },
  { label: 'Fit', check: 'radio', checked: state.zoom === 'Fit', group: 'Zoom' },
  { label: 'Actual size', check: 'radio', checked: state.zoom === 'Actual size', group: 'Zoom' },
  { label: 'Delete', tone: 'destructive', shortcut: ['⌫'] },
]

/** The application's answer to a chosen row: a check row flips, a radio row picks, any other is chosen. */
const chose = (state: State, value: string): State => {
  if (value === 'Grid') return { ...state, grid: !state.grid }
  if (value === 'Rulers') return { ...state, rulers: !state.rulers }
  if (value === 'Fit' || value === 'Actual size') return { ...state, zoom: value }
  return { ...state, chosen: Option.some(value) }
}

const initial: State = { grid: false, rulers: true, zoom: 'Fit', chosen: Option.none() }

const Model = Schema.Struct({ menu: Menu.Model, state: State })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: Menu.Message }
const got = (message: Menu.Message): Message => ({ _tag: 'Got', message })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const install = (css: string) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) + css
  document.head.append(sheet)
}

const mount = (direction: 'ltr' | 'rtl' = 'ltr') => {
  install(style.css)
  const container = document.createElement('div')
  container.id = 'rows'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [
        h.Style({
          padding: '40px',
          ...(direction === 'rtl' ? { paddingInlineStart: '600px' } : {}),
        }),
      ],
      [
        Menu.view(
          {
            model: model.menu,
            rows: rowsOf(model.state),
            buttonContent: h.span([], ['View']),
            onMessage: got,
            direction,
            mixins: [style.mixin],
          },
          h,
        ),
        h.p([h.AriaLabel('chosen')], [Option.getOrElse(model.state.chosen, () => 'nothing')]),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { menu: Menu.init('view', rowsOf(initial)), state: initial } }),
      update: (model: Model, message: Message) => {
        const next = Menu.update(model.menu, message.message)
        return {
          model: {
            menu: next.model,
            state: Option.match(Option.fromNullishOr(next.outMessage), {
              onNone: () => model.state,
              onSome: ({ value }) => chose(model.state, value),
            }),
          },
          commands: mapMessages(next.commands, got),
        }
      },
      view,
    }),
  )
}

const byId = (id: string) => document.getElementById(id)
const row = (index: number) => byId(`view-item-${index}`)!
const focusedId = () => document.activeElement?.id

/**
 * A key, and the row it makes active. One at a time: upstream's Menu reads
 * the next row from the last drawn frame.
 */
const to = async (key: string, index: number) => {
  await userEvent.keyboard(key)
  await vi.waitFor(() => expect(row(index).hasAttribute('data-active')).toBe(true))
}

/** Opens the menu from the keyboard, focus on its panel. */
const open = async () => {
  const trigger = await vi.waitFor(() => {
    const found = byId('view-button')
    expect(found).not.toBeNull()
    return found!
  })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(focusedId()).toBe('view-items'))
}

test('checkbox and radio rows carry their roles and state, in groups under their headings', async () => {
  const handle = mount()
  try {
    await open()
    expect([0, 1, 2, 3, 4].map(index => row(index).getAttribute('role'))).toEqual([
      'menuitemcheckbox',
      'menuitemcheckbox',
      'menuitemradio',
      'menuitemradio',
      'menuitem',
    ])
    expect([0, 1, 2, 3].map(index => row(index).getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'true',
      'false',
    ])
    expect(row(4).hasAttribute('aria-checked')).toBe(false)
    const groups = [...byId('view-items')!.querySelectorAll('[role="group"]')]
    const named = groups.map(group =>
      Option.match(Option.fromNullishOr(group.getAttribute('aria-labelledby')), {
        onNone: () => '',
        onSome: id => byId(id)?.textContent ?? '',
      }),
    )
    expect(named).toEqual(['Show', 'Zoom', ''])
    // A separator before every group after the first, outside the groups.
    const separators = [...byId('view-items')!.querySelectorAll('[role="separator"]')]
    expect(separators).toHaveLength(2)
    expect(separators.every(line => line.closest('[role="group"]') === null)).toBe(true)
  } finally {
    handle.dispose()
  }
})

test('a click, Space or Enter on a check row sets it and leaves the menu open', async () => {
  const handle = mount()
  try {
    await open()
    await userEvent.click(row(0))
    await vi.waitFor(() => expect(row(0).getAttribute('aria-checked')).toBe('true'))
    expect(byId('view-items')).not.toBeNull()
    // The keys go on from where the pointer left them: Space on the radio row below.
    await to('{ArrowDown}', 1)
    await to('{ArrowDown}', 2)
    await to('{ArrowDown}', 3)
    await userEvent.keyboard(' ')
    await vi.waitFor(() => expect(row(3).getAttribute('aria-checked')).toBe('true'))
    expect(row(2).getAttribute('aria-checked')).toBe('false')
    expect(focusedId()).toBe('view-items')
    await to('{ArrowUp}', 2)
    await to('{ArrowUp}', 1)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(row(1).getAttribute('aria-checked')).toBe('false'))
    expect(byId('view-items')).not.toBeNull()
    // A plain row still closes the menu, focus back on its trigger.
    await to('{End}', 4)
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(focusedId()).toBe('view-button'))
    expect(byId('view-items')).toBeNull()
    expect(document.querySelector('[aria-label="chosen"]')?.textContent).toBe('Delete')
  } finally {
    handle.dispose()
  }
})

/** A row's mark, drawn as its `check` slot's `::before`. */
const mark = (index: number) =>
  getComputedStyle(row(index).querySelector('[data-kind]')!, '::before')

test('a checked row shows its mark, an unchecked one none, and every row keeps the column', async () => {
  const handle = mount()
  try {
    await open()
    expect(mark(1).content).toBe('""')
    expect(Number.parseFloat(mark(1).height)).toBeGreaterThan(Number.parseFloat(mark(1).width))
    expect(mark(2).content).toBe('""')
    expect(mark(2).width).toBe(mark(2).height)
    expect(mark(0).content).toBe('none')
    expect(mark(3).content).toBe('none')
    // The words of the plain row stand where the check rows' do.
    const words = (index: number, label: string) =>
      [...row(index).querySelectorAll('span')]
        .find(span => span.children.length === 0 && span.textContent === label)!
        .getBoundingClientRect().left
    expect(Math.abs(words(4, 'Delete') - words(0, 'Grid'))).toBeLessThan(1)
  } finally {
    handle.dispose()
  }
})

test.each(['ltr', 'rtl'] as const)(
  '%s: a shortcut sits at the row end, its keys left to right, and names them',
  async direction => {
    const handle = mount(direction)
    try {
      await open()
      expect(row(0).getAttribute('aria-keyshortcuts')).toBe('Meta+G')
      const box = row(0).getBoundingClientRect()
      const keys = [...row(0).querySelectorAll('kbd kbd')].map(key => key.getBoundingClientRect())
      expect(keys).toHaveLength(2)
      // ⌘ before G on the screen, whichever way the row reads.
      expect(keys[0]!.left).toBeLessThan(keys[1]!.left)
      const shortcut = row(0)
        .querySelector('[aria-hidden="true"]:has(kbd)')!
        .getBoundingClientRect()
      if (direction === 'ltr') expect(box.right - shortcut.right).toBeLessThan(24)
      else expect(shortcut.left - box.left).toBeLessThan(24)
    } finally {
      handle.dispose()
    }
  },
)

test('a destructive row is in the danger ink', async () => {
  const handle = mount()
  try {
    await open()
    const probe = document.createElement('span')
    probe.style.color = 'var(--fk-error-ink)'
    document.body.append(probe)
    expect(getComputedStyle(row(4)).color).toBe(getComputedStyle(probe).color)
    expect(getComputedStyle(row(0)).color).not.toBe(getComputedStyle(probe).color)
  } finally {
    handle.dispose()
  }
})

const BarModel = Schema.Struct({ bar: Menubar.Model, grid: Schema.Boolean })
type BarModel = typeof BarModel.Type
type BarMessage = { readonly _tag: 'Got'; readonly message: Menubar.Message }
const gotBar = (message: Menubar.Message): BarMessage => ({ _tag: 'Got', message })

test("a Menubar's checkbox row is set with its menu left open", async () => {
  install(style.css)
  const container = document.createElement('div')
  container.id = 'bar'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: BarModel,
      container,
      init: () => ({ model: { bar: Menubar.init(['bar-view']), grid: false } }),
      update: (model: BarModel, message: BarMessage) => {
        const next = Menubar.update(model.bar, message.message)
        return {
          model: {
            bar: next.model,
            grid: next.outMessage === undefined ? model.grid : !model.grid,
          },
          commands: mapMessages(next.commands, gotBar),
        }
      },
      view: (model: BarModel, h: HtmlBuilder<BarMessage>) =>
        Menubar.view(
          {
            label: 'Editor',
            model: model.bar,
            menus: [
              { label: 'View', rows: [{ label: 'Grid', check: 'checkbox', checked: model.grid }] },
            ],
            onMessage: gotBar,
            menuMixins: [style.mixin],
          },
          h,
        ),
    }),
  )
  try {
    const trigger = await vi.waitFor(() => {
      const found = byId('bar-view-button')
      expect(found).not.toBeNull()
      return found!
    })
    await userEvent.click(trigger)
    const grid = await vi.waitFor(() => {
      const found = byId('bar-view-item-0')
      expect(found?.getAttribute('role')).toBe('menuitemcheckbox')
      return found!
    })
    await userEvent.click(grid)
    await vi.waitFor(() =>
      expect(byId('bar-view-item-0')?.getAttribute('aria-checked')).toBe('true'),
    )
    expect(byId('bar-view-items')).not.toBeNull()
  } finally {
    handle.dispose()
  }
})
