/**
 * A long list of names that scrolls with the page, drawn with
 * `foldkit-mixins-ui`'s WindowList: only the rows in view of the window are
 * drawn, between spacers as tall as the rest, so the page keeps its own
 * scrolling, and its sticky heading stays over the rows. The names never
 * change, so the list's Model and the row number typed to go to are the
 * only state.
 */
import { Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
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

export const Model = Schema.Struct({ list: WindowList.Model, row: Schema.String })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotList: { message: WindowList.Message },
  ChangedRow: { text: Schema.String },
  WentToRow: {},
})
export type Message = typeof Message.Type

export const initial: Model = {
  list: WindowList.init({ id: `${ISLAND}/names`, estimatedHeight: 40 }),
  row: '',
}

const inList = (command: ReadonlyArray<Command.Command<WindowList.Message>>) =>
  Command.mapMessages(command, message => Message.GotList({ message }))

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    GotList: ({ message }) => {
      const next = WindowList.update(model.list, message)
      return {
        model: next.model === model.list ? model : modifyFields(model, { list: () => next.model }),
        commands: inList(next.commands ?? []),
      }
    },
    ChangedRow: ({ text }) => ({
      model: text === model.row ? model : modifyFields(model, { row: () => text }),
    }),
    // Rows are numbered from 1 on the page. The field's min and max stop a native submit, but a Message can come from anywhere.
    WentToRow: () => {
      const number = Number(model.row)
      return Number.isInteger(number) && number >= 1 && number <= NAMES.length
        ? { model, commands: inList([WindowList.reveal(model.list, number - 1, 'center')]) }
        : { model }
    },
  })
