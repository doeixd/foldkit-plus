/**
 * Audit of #558 item 5 for focus in a virtual list, on the shipped
 * VirtualList: a focused control in a row that scrolls out of the window, and
 * the row that comes back. A test named "today" pins current behaviour that
 * a finding in `docs/design/558-audit-FINDINGS.md` calls a gap.
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
import { Recipes, VirtualList, VirtualListSlots } from '../../src/index.js'

const theme = Theme.standard(Theme.make({ accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(VirtualListSlots)(Recipes.VirtualList({}))
const Model = Schema.Struct({ list: UiVirtualList.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotList: { message: UiVirtualList.Message } })
type Message = typeof Message.Type
const got = (message: UiVirtualList.Message) => Message.GotList({ message })

const items = Array.from({ length: 1000 }, (_, index) => `Item ${index}`)

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
  container.id = 'virtual-focus'
  document.body.append(container)
  return Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: { list: UiVirtualList.init({ id: 'items', rowHeightPx: 36 }) } }),
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
                itemToView: item => h.button([h.Type('button')], [item]),
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
const drawn = (label: string) =>
  Array.from(scroller().querySelectorAll<HTMLElement>('button')).find(
    button => button.textContent === label,
  )

test('a focused control in a row that scrolls out of the window leaves focus on the body, and the row coming back is not focused (today)', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(drawn('Item 3')).toBeDefined())
    drawn('Item 3')!.focus()
    expect(document.activeElement).toBe(drawn('Item 3'))
    scroller().scrollTop = 20_000
    await vi.waitFor(() => expect(drawn('Item 3')).toBeUndefined())
    expect(document.activeElement).toBe(document.body)
    scroller().scrollTop = 0
    await vi.waitFor(() => expect(drawn('Item 3')).toBeDefined())
    expect(document.activeElement).toBe(document.body)
  } finally {
    handle.dispose()
  }
})

test('a drawn row keeps focus while scrolling stays within the window that draws it', async () => {
  const handle = mount()
  try {
    await vi.waitFor(() => expect(drawn('Item 3')).toBeDefined())
    const row = drawn('Item 3')!
    row.focus()
    scroller().scrollTop = 36
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(drawn('Item 3')).toBe(row)
    expect(document.activeElement).toBe(row)
  } finally {
    handle.dispose()
  }
})
