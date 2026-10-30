/**
 * A long list of names that scrolls with the page, drawn with
 * `foldkit-mixins-ui`'s WindowList: only the rows in view of the window are
 * drawn, between spacers as tall as the rest, so the page keeps its own
 * scrolling, and its sticky heading stays over the rows. The names never
 * change, so the list's Model is the only state.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { WindowList } from 'foldkit-mixins-ui'

export const ISLAND = 'window-list'

const WORDS = ['amber', 'birch', 'cedar', 'delta', 'ember', 'fjord', 'grove', 'harbor']
const ENDINGS = ['.com', '.dev', '.app', '.io']

/** A thousand names, made once and kept, so the list's offsets are built once. */
export const NAMES: ReadonlyArray<string> = Array.from(
  { length: 1000 },
  (_, index) =>
    `${WORDS[index % WORDS.length]}-${Math.floor(index / WORDS.length) + 1}${ENDINGS[index % ENDINGS.length]}`,
)

export const Model = Schema.Struct({ list: WindowList.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ GotList: { message: WindowList.Message } })
export type Message = typeof Message.Type

export const initial: Model = {
  list: WindowList.init({ id: `${ISLAND}/names`, estimatedHeight: 40 }),
}

export const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    GotList: ({ message }) => {
      const next = WindowList.update(model.list, message).model
      return { model: next === model.list ? model : modifyFields(model, { list: () => next }) }
    },
  })
