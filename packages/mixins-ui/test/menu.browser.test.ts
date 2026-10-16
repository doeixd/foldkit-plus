/**
 * The Menu component on a real runtime. Under a button: ArrowRight on a
 * submenu's row moves focus into the submenu, drawn beside the row; ArrowLeft
 * and Escape bring focus back to the menu's panel with the submenu gone, and
 * right to left the two swap and the submenu opens on the left; Enter on a
 * submenu's row closes everything with focus on the trigger; and the pointer
 * resting on a submenu's row opens it. At a point: a right press on the area
 * opens the menu with its rows where the press landed, and its submenus open
 * beside their rows there too. Animated, the menu and its submenus stay
 * drawn while they leave, marked for the recipe's fade.
 */
import { Menu as UiMenu } from '@foldkit/ui'
import { Match, Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Menu, MenuSlots, MenuView, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const ROWS: ReadonlyArray<Menu.Row> = [
  { label: 'New tab' },
  { label: 'Share', items: ['Email', 'Messages'] },
  { label: 'Print' },
]
const Model = Schema.Struct({ menu: Menu.Model, chosen: Schema.Option(Schema.String) })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: Menu.Message }
const got = (message: Menu.Message): Message => ({ _tag: 'Got', message })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

interface Mounting {
  readonly opensAt: 'button' | 'point'
  readonly direction: 'ltr' | 'rtl'
  readonly around: (menu: Html, h: HtmlBuilder<Message>) => Html
  readonly isAnimated?: boolean
}

const mount = ({ opensAt, direction, around, isAnimated = false }: Mounting) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'menu'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Dir(direction)],
      [
        around(
          Menu.view(
            {
              model: model.menu,
              rows: ROWS,
              buttonContent: h.span([], ['File']),
              onMessage: got,
              opensAt,
              direction,
              mixins: [style.mixin],
            },
            h,
          ),
          h,
        ),
        h.p([h.AriaLabel('chosen')], [Option.getOrElse(model.chosen, () => 'nothing')]),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { menu: Menu.init('file', ROWS, { isAnimated }), chosen: Option.none() },
      }),
      update: (model: Model, message: Message) => {
        const next = Menu.update(model.menu, message.message)
        return {
          model: {
            menu: next.model,
            chosen: Option.orElse(
              Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value),
              () => model.chosen,
            ),
          },
          commands: mapMessages(next.commands, got),
        }
      },
      view,
    }),
  )
}

/** A menu under a button, room around it; right to left, room on both sides, so only the placement picks the left. */
const underButton = (direction: 'ltr' | 'rtl' = 'ltr', isAnimated = false) =>
  mount({
    opensAt: 'button',
    direction,
    isAnimated,
    around: (menu, h) =>
      h.div(
        [
          h.Style({
            padding: '40px',
            ...(direction === 'rtl' ? { paddingInlineStart: '600px' } : {}),
          }),
        ],
        [menu],
      ),
  })

/** A menu at a point, drawn inside the area that opens it. */
const inArea = () =>
  mount({
    opensAt: 'point',
    direction: 'ltr',
    around: (menu, h) =>
      h.div(
        [...Menu.target(got, h), h.AriaLabel('area'), h.Style({ margin: '80px', padding: '60px' })],
        ['report.pdf', menu],
      ),
  })

const focusedId = () => document.activeElement?.id
const byId = (id: string) => document.getElementById(id)
const shareRow = () => byId('file-item-1')

/** Opens the menu from the keyboard and moves to Share, focus on the menu's panel. */
const toShare = async () => {
  const trigger = await vi.waitFor(() => {
    const found = byId('file-button')
    expect(found).not.toBeNull()
    return found!
  })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  await vi.waitFor(() => expect(focusedId()).toBe('file-items'))
  await userEvent.keyboard('{ArrowDown}')
  await vi.waitFor(() => expect(shareRow()?.hasAttribute('data-active')).toBe(true))
}

/** The panel's box once it is laid out. */
const panelOf = (id: string) =>
  vi.waitFor(() => {
    const found = byId(id)
    expect(found?.getBoundingClientRect().height).toBeGreaterThan(0)
    return found!.getBoundingClientRect()
  })

test('ArrowRight opens the submenu beside its row, focus in it on its first row', async () => {
  const handle = underButton()
  try {
    await toShare()
    expect(shareRow()?.getAttribute('aria-haspopup')).toBe('menu')
    expect(shareRow()?.getAttribute('aria-expanded')).toBe('false')
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-sub-1-items'))
    expect(shareRow()?.getAttribute('aria-expanded')).toBe('true')
    expect(byId('file-sub-1-item-0')?.hasAttribute('data-active')).toBe(true)
    const row = shareRow()!.getBoundingClientRect()
    const panel = byId('file-sub-1-items')!.getBoundingClientRect()
    // Beside the row, on either side, its top level with the row's.
    expect(panel.left >= row.right - 1 || panel.right <= row.left + 1).toBe(true)
    expect(Math.abs(panel.top - row.top)).toBeLessThan(16)
    // The keys move the submenu's rows, not the menu's.
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() =>
      expect(byId('file-sub-1-item-1')?.hasAttribute('data-active')).toBe(true),
    )
    expect(shareRow()?.hasAttribute('data-active')).toBe(true)
  } finally {
    handle.dispose()
  }
})

test.each(['{ArrowLeft}', '{Escape}'])(
  '%s closes the submenu alone, focus back on the menu',
  async key => {
    const handle = underButton()
    try {
      await toShare()
      await userEvent.keyboard('{ArrowRight}')
      await vi.waitFor(() => expect(focusedId()).toBe('file-sub-1-items'))
      await userEvent.keyboard(key)
      await vi.waitFor(() => expect(focusedId()).toBe('file-items'))
      expect(byId('file-sub-1-items')).toBeNull()
      expect(shareRow()?.hasAttribute('data-active')).toBe(true)
      expect(shareRow()?.getAttribute('aria-expanded')).toBe('false')
    } finally {
      handle.dispose()
    }
  },
)

test('right to left, ArrowLeft opens the submenu on the left and ArrowRight closes it', async () => {
  const handle = underButton('rtl')
  try {
    await toShare()
    await userEvent.keyboard('{ArrowRight}')
    await new Promise(resolve => requestAnimationFrame(resolve))
    expect(byId('file-sub-1-items')).toBeNull()
    await userEvent.keyboard('{ArrowLeft}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-sub-1-items'))
    const row = shareRow()!.getBoundingClientRect()
    await vi.waitFor(() =>
      expect(byId('file-sub-1-items')!.getBoundingClientRect().right).toBeLessThanOrEqual(
        row.left + 1,
      ),
    )
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-items'))
    expect(byId('file-sub-1-items')).toBeNull()
  } finally {
    handle.dispose()
  }
})

test("Enter on a submenu's row closes everything, focus on the trigger", async () => {
  const handle = underButton()
  try {
    await toShare()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-sub-1-items'))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-button'))
    expect(byId('file-items')).toBeNull()
    expect(document.querySelector('[aria-label="chosen"]')?.textContent).toBe('Email')
  } finally {
    handle.dispose()
  }
})

test("the pointer resting on a submenu's row opens it", async () => {
  const handle = underButton()
  try {
    await toShare()
    await userEvent.hover(byId('file-item-0')!)
    await vi.waitFor(() => expect(byId('file-item-0')?.hasAttribute('data-active')).toBe(true))
    await userEvent.hover(shareRow()!)
    await vi.waitFor(() => expect(shareRow()?.getAttribute('aria-expanded')).toBe('true'))
    // Pointing at a plain row closes it again.
    await userEvent.hover(byId('file-item-2')!)
    await vi.waitFor(() => expect(byId('file-sub-1-items')).toBeNull())
    expect(byId('file-items')).not.toBeNull()
  } finally {
    handle.dispose()
  }
})

test('a right press opens the menu with its rows where it landed, its submenus beside their rows', async () => {
  const handle = inArea()
  try {
    const area = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[aria-label="area"]')
      expect(found).not.toBeNull()
      return found!
    })
    // Unequal offsets, so a press read with its axes swapped lands far off.
    await userEvent.click(area, { button: 'right', position: { x: 140, y: 30 } })
    const box = area.getBoundingClientRect()
    const panel = await panelOf('file-items')
    // Its top-left corner at the press, within a few pixels of anchoring.
    expect(Math.abs(panel.left - (box.left + 140))).toBeLessThan(12)
    expect(Math.abs(panel.top - (box.top + 30))).toBeLessThan(12)
    // Opened as a key opens a Menu, on its first row; down to Share and in.
    await vi.waitFor(() => expect(focusedId()).toBe('file-items'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(shareRow()?.hasAttribute('data-active')).toBe(true))
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-sub-1-items'))
    const row = shareRow()!.getBoundingClientRect()
    const submenu = await panelOf('file-sub-1-items')
    expect(submenu.left).toBeGreaterThanOrEqual(row.right - 1)
  } finally {
    handle.dispose()
  }
})

test('an open panel escapes an overflow box: the top layer, not the page flow', async () => {
  const handle = mount({
    opensAt: 'button',
    direction: 'ltr',
    around: (menu, h) =>
      h.div(
        [
          h.Id('clip-box'),
          h.Style({ blockSize: '60px', overflow: 'hidden', border: '1px solid transparent' }),
        ],
        [menu],
      ),
  })
  try {
    await toShare()
    const box = byId('clip-box')!.getBoundingClientRect()
    const panel = await panelOf('file-items')
    // Taller than the box, hanging past it.
    expect(panel.height).toBeGreaterThan(box.height)
    expect(panel.bottom).toBeGreaterThan(box.bottom + 10)
    // Painted past it too: the point below the box hits the panel, not the click-away behind it.
    await vi.waitFor(() => {
      const hit = document.elementFromPoint(panel.left + 10, box.bottom + 5)
      expect(hit).not.toBeNull()
      expect(byId('file-items')!.contains(hit)).toBe(true)
    })
  } finally {
    handle.dispose()
  }
})

/**
 * The transition marks the panel `id` passes through until `close` has it
 * gone: they come and go within frames, so each change is recorded.
 */
const leaving = async (id: string, close: () => Promise<void>) => {
  const panel = byId(id)!
  const states: Array<string> = []
  const observer = new MutationObserver(() =>
    states.push(
      ['closed', 'enter', 'leave'].filter(mark => panel.hasAttribute(`data-${mark}`)).join(' '),
    ),
  )
  observer.observe(panel, { attributes: true })
  try {
    await close()
    await vi.waitFor(() => expect(byId(id)).toBeNull())
  } finally {
    observer.disconnect()
  }
  return states
}

test('an animated menu stays drawn while it leaves, marked for its fade', async () => {
  const handle = underButton('ltr', true)
  try {
    await toShare()
    const states = await leaving('file-items', () => userEvent.keyboard('{Escape}'))
    expect(states).toContain('closed leave')
    expect(focusedId()).toBe('file-button')
  } finally {
    handle.dispose()
  }
})

test("an animated menu's submenu stays drawn while it leaves, marked for its fade", async () => {
  const handle = underButton('ltr', true)
  try {
    await toShare()
    await userEvent.keyboard('{ArrowRight}')
    await vi.waitFor(() => expect(focusedId()).toBe('file-sub-1-items'))
    const states = await leaving('file-sub-1-items', () => userEvent.keyboard('{ArrowLeft}'))
    expect(states).toContain('closed leave')
    expect(focusedId()).toBe('file-items')
  } finally {
    handle.dispose()
  }
})

type Action = 'Rename' | 'Duplicate' | 'Delete'
const Actions = MenuView.create<Action>()
const AppModel = Schema.Struct({ menu: UiMenu.Model, point: Schema.Option(Menu.Point) })
type AppModel = typeof AppModel.Type
type AppMessage =
  | { readonly _tag: 'GotActions'; readonly message: UiMenu.Message }
  | { readonly _tag: 'Pressed'; readonly point: Menu.Point }
  | { readonly _tag: 'AskedToOpen' }

test("an application's own typed, grouped Menu opens at a point through toView", async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'actions'
  document.body.appendChild(container)
  const fold = (model: AppModel, message: UiMenu.Message) => {
    const next = Actions.update(model.menu, message)
    return {
      model: { ...model, menu: next.model },
      commands: mapMessages(next.commands ?? [], (inner): AppMessage => ({
        _tag: 'GotActions',
        message: inner,
      })),
    }
  }
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model: AppModel,
      container,
      init: () => ({ model: { menu: UiMenu.init({ id: 'actions' }), point: Option.none() } }),
      update: (model: AppModel, message: AppMessage) =>
        Match.valueTags(message, {
          GotActions: ({ message }) => fold(model, message),
          Pressed: ({ point }) => ({
            model: { ...model, point: Option.some(point) },
            commands: [],
          }),
          AskedToOpen: () =>
            fold(model, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) })),
        }),
      view: (model: AppModel, h: HtmlBuilder<AppMessage>) =>
        h.div(
          [
            ...Menu.pointTarget(
              {
                onPress: (point): AppMessage => ({ _tag: 'Pressed', point }),
                onOpen: { _tag: 'AskedToOpen' },
              },
              h,
            ),
            h.AriaLabel('area'),
            h.Style({ margin: '80px', padding: '60px' }),
          ],
          [
            'report.pdf',
            h.submodel({
              slotId: 'actions',
              model: model.menu,
              view: Actions.view,
              viewInputs: {
                anchor: { placement: 'bottom-start', gap: 0, padding: 8, portal: false },
                items: ['Rename', 'Duplicate', 'Delete'],
                itemGroupKey: (action: Action) => (action === 'Delete' ? 'danger' : 'edit'),
                itemToConfig: (action: Action) => ({ content: h.span([], [action]) }),
                buttonContent: h.span([], ['Actions']),
                toView: Menu.toView([style.mixin], { h }, Menu.drawAtPoint(model.point, h)),
              },
              toParentMessage: (message): AppMessage => ({ _tag: 'GotActions', message }),
            }),
          ],
        ),
    }),
  )
  try {
    const area = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[aria-label="area"]')
      expect(found).not.toBeNull()
      return found!
    })
    await userEvent.click(area, { button: 'right', position: { x: 140, y: 30 } })
    const box = area.getBoundingClientRect()
    const panel = await panelOf('actions-items')
    expect(Math.abs(panel.left - (box.left + 140))).toBeLessThan(12)
    expect(Math.abs(panel.top - (box.top + 30))).toBeLessThan(12)
    expect(document.querySelectorAll('#actions-items [role="group"]')).toHaveLength(2)
    expect(byId('actions-button')?.tabIndex).toBe(-1)
  } finally {
    handle.dispose()
  }
})
