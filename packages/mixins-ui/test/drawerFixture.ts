/**
 * A Drawer on a real page, peeking or open, with a grip and a tool in it,
 * for the Drawer's browser tests.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { expect, vi } from 'vitest'
import * as Drawer from '../src/drawer.js'
import { Drawer as DrawerRecipe } from '../src/recipes/drawer.js'
import type { SwipeConfig } from '../src/sheet.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
export const style = Style.forSlots(Drawer.DrawerSlots)(DrawerRecipe({}))
export const belowLg = Style.forSlots(Drawer.DrawerSlots)(DrawerRecipe({ dock: 'below-lg' }))
const Model = Schema.Struct({ drawer: Drawer.Model })
type Model = typeof Model.Type

export const mount = (open: boolean, drawn = style, swipe?: SwipeConfig) => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + drawn.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'drawer-browser'
  document.body.append(container)
  let releases = 0
  const runtime = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: {
          drawer: Drawer.init({
            id: 'drawer-body',
            open,
            ...(swipe === undefined ? {} : { swipe }),
          }),
        },
      }),
      update: (model: Model, message: Drawer.Message) => {
        if (message._tag === 'Released') releases++
        return { model: { drawer: Drawer.update(model.drawer, message) } }
      },
      view: (model: Model, h: HtmlBuilder<Drawer.Message>) =>
        Drawer.view(
          {
            model: model.drawer,
            onMessage: message => message,
            labels: { open: 'Hide the tools', closed: 'Show the tools' },
            style: drawn,
            // The sizes on a wrapper: the panel's own style is the drag's.
            draw: ({ panel, handle, body, grip }) =>
              h.div(
                [h.Style({ '--fk-drawer-height': '400px', '--fk-drawer-peek': '80px' })],
                [
                  h.aside(panel, [
                    h.button(handle, []),
                    h.div([...grip, h.Id('grip')], [h.button([h.Id('in-grip')], ['Tabs'])]),
                    h.div(body, [h.button([], ['A tool'])]),
                  ]),
                ],
              ),
          },
          h,
        ),
    }),
  )
  return { dispose: () => runtime.dispose(), releases: () => releases }
}

export const panel = () =>
  vi.waitFor(() => {
    const found = document.querySelector<HTMLElement>('[data-drawer]')
    expect(found).not.toBeNull()
    return found!
  })
export const settled = (element: Element) =>
  vi.waitFor(() => expect(element.getAnimations({ subtree: true })).toEqual([]))
/** How far down the panel is drawn: its translate's y. */
export const down = (element: Element) => new DOMMatrix(getComputedStyle(element).transform).m42
