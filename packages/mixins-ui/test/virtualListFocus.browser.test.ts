/**
 * What focus does in VirtualList (upstream's scrolling list), measured.
 */
import * as UiVirtualList from '@foldkit/ui/virtualList'
import { Schema } from 'effect'
import { mapMessages } from 'foldkit/command'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Runtime from 'foldkit/runtime'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { afterEach, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Style } from 'foldkit-mixins'
import { VirtualList as VirtualListRecipe } from '../src/recipes/index.js'
import * as VirtualList from '../src/virtualList.js'

const style = Style.forSlots(VirtualList.VirtualListSlots)(VirtualListRecipe({}))

const Model = Schema.Struct({ list: UiVirtualList.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ GotList: { message: UiVirtualList.Message } })
type Message = typeof Message.Type
const got = (message: UiVirtualList.Message) => Message.GotList({ message })
const items = Array.from({ length: 1000 }, (_, index) => index)

let handle: { dispose: () => void } | undefined
afterEach(() => {
  handle?.dispose()
  handle = undefined
  document.body.replaceChildren()
})

const mount = async () => {
  const before = document.createElement('button')
  before.id = 'before'
  const container = document.createElement('div')
  container.id = 'virtual-list-focus'
  const after = document.createElement('button')
  after.id = 'after'
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent = style.css
  document.head.append(sheet)
  document.body.append(before, container, after)
  handle = Runtime.embed(
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
          [h.Style({ height: '300px', display: 'flex', 'flex-direction': 'column' })],
          [
            VirtualList.view<number, Message>(
              {
                model: model.list,
                items,
                itemToKey: item => `k${item}`,
                itemToView: item => h.button([h.Id(`b-${item}`)], [`Button ${item}`]),
                onMessage: got,
                itemToRowHeightPx: () => 36,
                style,
              },
              h,
            ),
          ],
        ),
      slow: false,
    }),
  )
  await vi.waitFor(() =>
    expect(document.querySelectorAll('li[role="listitem"]').length).toBeGreaterThan(0),
  )
}

test('measure: focused row scrolled out', async () => {
  await mount()
  document.getElementById('before')!.focus()
  await userEvent.tab()
  const first = document.activeElement?.id
  document.querySelector('ul')!.scrollTop = 20_000
  await vi.waitFor(() => expect(document.getElementById('b-0')).toBeNull())
  const report = { first, active: document.activeElement?.tagName, id: document.activeElement?.id }
  await userEvent.tab()
  const next = document.activeElement?.id
  const text = document.body.textContent!.includes('Button 0')
  expect.fail('FOCUS-V ' + JSON.stringify({ report, next, text }))
})
