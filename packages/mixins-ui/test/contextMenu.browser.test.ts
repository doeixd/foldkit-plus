/**
 * A context menu on a real runtime, over `@foldkit/ui`'s Menu: a right
 * press on the area opens the menu with its rows where the press landed,
 * and the browser's own menu stays shut.
 */
import { Option, Schema } from 'effect'
import { Menu as UiMenu } from '@foldkit/ui'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { ContextMenu, MenuSlots, MenuView, Recipes } from '../src/index.js'

const theme = Theme.compose(Theme.tokens, Theme.oklch({ accent: { h: 265, c: 0.16, l: '52%' } }))
const style = Style.forSlots(MenuSlots)(Recipes.Menu({}))
const Actions = MenuView.create<string>()
const Point = Schema.Struct({ x: Schema.Number, y: Schema.Number })
const Model = Schema.Struct({ menu: UiMenu.Model, point: Schema.Option(Point) })
type Model = typeof Model.Type
type Message =
  | { readonly _tag: 'Got'; readonly message: UiMenu.Message }
  | { readonly _tag: 'Pointed'; readonly point: ContextMenu.Point }
  | { readonly _tag: 'Opened' }

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const fold = (model: Model, message: UiMenu.Message) => {
  const next = Actions.update(model.menu, message)
  return {
    model: { ...model, menu: next.model },
    commands: mapMessages(next.commands, (inner): Message => ({ _tag: 'Got', message: inner })),
  }
}

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'context-menu'
  document.body.appendChild(container)
  const view = (model: Model, h: HtmlBuilder<Message>) =>
    h.div(
      [],
      [
        h.div(
          [
            ...ContextMenu.target<Message>(
              { onPoint: point => ({ _tag: 'Pointed', point }), onOpen: { _tag: 'Opened' } },
              h,
            ),
            h.AriaLabel('area'),
            h.Style({ margin: '80px', padding: '60px' }),
          ],
          ['report.pdf'],
        ),
        h.submodel({
          slotId: model.menu.id,
          model: model.menu,
          view: Actions.view,
          viewInputs: {
            anchor: { placement: 'bottom-start', gap: 0, padding: 8, portal: false },
            items: ['Rename', 'Delete'],
            itemToConfig: (action: string) => ({ content: h.span([], [action]) }),
            buttonContent: h.span([], ['Actions']),
            toView: ContextMenu.toView([style.mixin], { h }, model.point),
          },
          toParentMessage: (message: UiMenu.Message): Message => ({ _tag: 'Got', message }),
        }),
      ],
    )
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { menu: UiMenu.init({ id: 'files' }), point: Option.none() } }),
      update: (model: Model, message: Message) => {
        switch (message._tag) {
          case 'Got':
            return fold(model, message.message)
          case 'Pointed':
            return { model: { ...model, point: Option.some(message.point) } }
          case 'Opened':
            return fold(model, UiMenu.Message.Opened({ maybeActiveItemIndex: Option.some(0) }))
        }
      },
      view,
    }),
  )
}

test('a right press opens the menu with its rows where it landed', async () => {
  const handle = mount()
  try {
    const area = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[aria-label="area"]')
      expect(found).not.toBeNull()
      return found!
    })
    await userEvent.click(area, { button: 'right', position: { x: 40, y: 30 } })
    const rows = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>('[role="menu"]')
      expect(found?.getBoundingClientRect().height).toBeGreaterThan(0)
      return found!
    })
    const box = area.getBoundingClientRect()
    const panel = rows.getBoundingClientRect()
    // Its top-left corner at the press, within a few pixels of anchoring.
    expect(Math.abs(panel.left - (box.left + 40))).toBeLessThan(12)
    expect(Math.abs(panel.top - (box.top + 30))).toBeLessThan(12)
  } finally {
    handle.dispose()
  }
})
