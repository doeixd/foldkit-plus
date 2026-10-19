/**
 * A folded trail whose ellipsis opens a Menu of the hidden steps, on a real
 * runtime: a press opens it with a row per hidden step; the keys choose one,
 * which the application turns back into its step; Escape shuts it with
 * focus on the ellipsis; and the ellipsis keeps the trail's look, not the
 * Menu style's bordered trigger.
 */
import { Option, Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import { Layers, Style } from 'foldkit-mixins'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import * as Breadcrumb from '../src/breadcrumb.js'
import { BreadcrumbSlots } from '../src/breadcrumb.js'
import * as Menu from '../src/menu.js'
import { MenuSlots } from '../src/menu.js'
import { Breadcrumb as BreadcrumbRecipe } from '../src/recipes/breadcrumb.js'
import { Menu as MenuRecipe } from '../src/recipes/menu.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const trail = Style.forSlots(BreadcrumbSlots)(BreadcrumbRecipe({}))
const menu = Style.forSlots(MenuSlots)(MenuRecipe({}))
const steps = ['Home', 'Docs', 'Packages', 'Mixins', 'Recipes', 'Breadcrumb'].map(
  (label, index, all) =>
    index === all.length - 1 ? { label, current: true } : { label, href: `/${label}` },
)
const MAX = 3

const Model = Schema.Struct({ menu: Menu.Model, went: Schema.Option(Schema.String) })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotMenu: { message: Menu.Message } })
type Message = typeof Message.Type
const got = (message: Menu.Message) => Message.GotMenu({ message })

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme))) +
    // The Menu's style last, so only the layer can let the trail's look win.
    trail.css +
    menu.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'breadcrumb-menu'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { menu: Menu.init('trail', Breadcrumb.menuRows(steps, MAX)), went: Option.none() },
      }),
      update: (model: Model, { message }: Message) => {
        const next = Menu.update(model.menu, message)
        // A row chosen is the step it stands for; the application would go to its href.
        const went = Option.flatMap(Option.fromNullishOr(next.outMessage), ({ value }) =>
          Option.flatMap(Breadcrumb.chosen(steps, MAX, value), step =>
            Option.fromNullishOr(step.href),
          ),
        )
        return {
          model: modifyFields(model, {
            menu: () => next.model,
            went: before => Option.orElse(went, () => before),
          }),
          commands: mapMessages(next.commands, got),
        }
      },
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [],
          [
            Breadcrumb.view(
              {
                steps,
                collapse: {
                  max: MAX,
                  menu: { model: model.menu, onMessage: got, mixins: [menu.mixin] },
                },
                style: trail,
              },
              h,
            ),
            h.output([], [Option.getOrElse(model.went, () => 'nowhere')]),
          ],
        ),
    }),
  )
}

const ellipsis = () => document.querySelector<HTMLElement>('button[aria-label="Show 3 more"]')!
const rows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
    row => row.textContent,
  )
const went = () => document.querySelector('output')!.textContent
const active = () => document.querySelector('[role="menuitem"][data-active]')?.textContent

test('a press on the ellipsis opens a row for each hidden step, and a row chosen is its step', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(ellipsis()).toBeTruthy())
    expect(ellipsis().getAttribute('aria-haspopup')).toBe('menu')
    await userEvent.click(ellipsis())
    await vi.waitFor(() => expect(rows()).toEqual(['Docs', 'Packages', 'Mixins']))
    await userEvent.click(
      Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]'))[1]!,
    )
    await vi.waitFor(() => {
      expect(went()).toBe('/Packages')
      expect(rows()).toEqual([])
    })
  } finally {
    handle.dispose()
  }
})

test('from the keyboard: Enter opens, the arrows and Enter choose, Escape returns to the ellipsis', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(ellipsis()).toBeTruthy())
    ellipsis().focus()
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(rows()).toHaveLength(3))
    await userEvent.keyboard('{Escape}')
    await vi.waitFor(() => {
      expect(rows()).toEqual([])
      expect(document.activeElement).toBe(ellipsis())
    })
    await userEvent.keyboard('{Enter}')
    // Opened by a key, the first row is active.
    await vi.waitFor(() => expect(active()).toBe('Docs'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(active()).toBe('Packages'))
    await userEvent.keyboard('{ArrowDown}')
    await vi.waitFor(() => expect(active()).toBe('Mixins'))
    await userEvent.keyboard('{Enter}')
    await vi.waitFor(() => expect(went()).toBe('/Mixins'))
  } finally {
    handle.dispose()
  }
})

test('the ellipsis keeps the trail’s look, not the Menu style’s trigger', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(ellipsis()).toBeTruthy())
    const look = getComputedStyle(ellipsis())
    expect(look.borderTopWidth).toBe('0px')
    expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)')
    // As tall as the trail's line, not a rung of the ladder.
    const link = document.querySelector('a')!.getBoundingClientRect()
    expect(ellipsis().getBoundingClientRect().height).toBeLessThan(link.height + 6)
  } finally {
    handle.dispose()
  }
})
