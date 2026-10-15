/**
 * A nested menu on a real runtime: ArrowRight on a submenu's row moves focus
 * into the submenu, drawn beside the row; ArrowLeft and Escape bring focus
 * back to the menu's panel with the submenu gone; Enter on a submenu's row
 * closes everything with focus on the trigger; and the pointer resting on a
 * submenu's row opens it.
 */
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { MenuSlots, Recipes } from '../src/index.js'
import * as NestedMenu from '../src/nestedMenu.js'
import { NestedMenuSlots } from '../src/nestedMenu.js'
import { NestedMenu as NestedMenuRecipe } from '../src/recipes/nestedMenu.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const menuStyle = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const rowStyle = Style.forSlots(NestedMenuSlots)(NestedMenuRecipe({}))
const ROWS: ReadonlyArray<NestedMenu.NestedRow> = [
  { label: 'New tab' },
  { label: 'Share', items: ['Email', 'Messages'] },
  { label: 'Print' },
]
const Model = Schema.Struct({ nested: NestedMenu.Model, chosen: Schema.Option(Schema.String) })
type Model = typeof Model.Type
type Message = { readonly _tag: 'Got'; readonly message: NestedMenu.Message }
const got = (message: NestedMenu.Message): Message => ({ _tag: 'Got', message })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    menuStyle.css +
    rowStyle.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'nested-menu'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [h.Style({ padding: '40px' })],
      [
        NestedMenu.view(
          {
            model: model.nested,
            rows: ROWS,
            buttonContent: h.span([], ['File']),
            onMessage: got,
            style: rowStyle,
            menuMixins: [menuStyle.mixin],
            submenuMixins: [menuStyle.mixin],
          },
          h,
        ),
        h.p(
          [h.AriaLabel('chosen')],
          [Option.getOrElse(model.chosen, () => 'nothing')],
        ),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { nested: NestedMenu.init('file', ROWS), chosen: Option.none() } }),
      update: (model: Model, message: Message) => {
        const next = NestedMenu.update(model.nested, message.message)
        return {
          model: {
            nested: next.model,
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

test('ArrowRight opens the submenu beside its row, focus in it on its first row', async () => {
  const handle = mount()
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
    const handle = mount()
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

test("Enter on a submenu's row closes everything, focus on the trigger", async () => {
  const handle = mount()
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
  const handle = mount()
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
