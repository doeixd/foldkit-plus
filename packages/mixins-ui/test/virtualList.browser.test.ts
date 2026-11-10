/**
 * VirtualList in a real page: a thousand rows in a fixed-height box draw only
 * the window in view, and scrolling the box to its end draws the last row.
 */
import * as UiVirtualList from '@foldkit/ui/virtualList'
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
import { Recipes, VirtualList, VirtualListSlots } from '../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(VirtualListSlots)(Recipes.VirtualList({}))
const Model = Schema.Struct({ list: UiVirtualList.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotList: { message: UiVirtualList.Message } })
type Message = typeof Message.Type
const got = (message: UiVirtualList.Message) => Message.GotList({ message })

const items = Array.from({ length: 1000 }, (_, index) => `Item ${index}`)
const rowHeight = 36

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'virtual-list-browser'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({
        model: { list: UiVirtualList.init({ id: 'items', rowHeightPx: rowHeight }) },
      }),
      update: (model: Model, message: Message): Return<Model, Message> =>
        Message.match(message, {
          GotList: ({ message }) => {
            const next = UiVirtualList.update(model.list, message)
            return {
              model:
                next.model === model.list ? model : modifyFields(model, { list: () => next.model }),
              commands: mapMessages(next.commands ?? [], got),
            }
          },
        }),
      view: (model: Model, h: HtmlBuilder<Message>) =>
        h.div(
          [h.Style({ width: '320px' })],
          [
            VirtualList.view<string, Message>(
              {
                model: model.list,
                items,
                itemToKey: item => item,
                itemToView: item => h.span([], [item]),
                onMessage: got,
                style,
              },
              h,
            ),
          ],
        ),
    }),
  )
}

const scroller = () => document.querySelector<HTMLElement>('ul')!
const drawnRows = () =>
  Array.from(scroller().querySelectorAll<HTMLElement>('li')).map(row => row.textContent!.trim())

test('a thousand rows draw a window of them, and the end draws the last', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(drawnRows()).toContain('Item 0'))
    const box = scroller().getBoundingClientRect().height
    const first = drawnRows()
    // The rows in view plus an overscan: tens, never the thousand.
    expect(first.length).toBeGreaterThanOrEqual(Math.floor(box / rowHeight))
    expect(first.length).toBeLessThan(60)
    expect(first).not.toContain('Item 999')
    // The scroll height still stands for every row, in spacers.
    expect(scroller().scrollHeight).toBeGreaterThanOrEqual(1000 * rowHeight)

    scroller().scrollTop = scroller().scrollHeight
    await vi.waitFor(() => expect(drawnRows()).toContain('Item 999'))
    const last = drawnRows()
    expect(last.length).toBeLessThan(60)
    expect(last).not.toContain('Item 0')
    expect(
      Array.from(scroller().querySelectorAll('li')).at(-1)!.getBoundingClientRect().bottom,
    ).toBeLessThanOrEqual(scroller().getBoundingClientRect().bottom + 1)
  } finally {
    handle.dispose()
  }
})
