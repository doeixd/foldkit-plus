/**
 * A long list of names that scrolls with the page, drawn with
 * `foldkit-mixins-ui`'s WindowList: only the rows in view of the window are
 * drawn, between spacers as tall as the rest, so the page keeps its own
 * scrolling, and its sticky heading stays over the rows. The names never
 * change, so the list's Model and the row number typed to go to are the
 * only state.
 */
import { Match, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles } from 'foldkit-mixins-ui'

export const ISLAND = 'window-list'

const WORDS = ['amber', 'birch', 'cedar', 'delta', 'ember', 'fjord', 'grove', 'harbor']
const ENDINGS = ['.com', '.dev', '.app', '.io']

/** A thousand names, made once and kept, so the list's offsets are built once. */
export const NAMES: ReadonlyArray<string> = Array.from(
  { length: 1000 },
  (_, index) =>
    `${WORDS[index % WORDS.length]}-${Math.floor(index / WORDS.length) + 1}${ENDINGS[index % ENDINGS.length]}`,
)

export const App = Bundle.compose({ row: Schema.String }).pipe(
  Bundle.withMessages({ ChangedRow: { text: Schema.String }, WentToRow: {} }),
  Bundle.withChild('list', Bundles.WindowList, {
    args: { id: `${ISLAND}/names`, estimatedHeight: 40 },
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({ row: '' }).model

export const update = App.placements.update((model, message) =>
  Match.valueTags(message, {
    ChangedRow: ({ text }) => ({
      model: text === model.row ? model : modifyFields(model, { row: () => text }),
    }),
    // Rows are numbered from 1 on the page. The field's min and max stop a native submit, but a Message can come from anywhere.
    WentToRow: () => {
      const number = Number(model.row)
      return Number.isInteger(number) && number >= 1 && number <= NAMES.length
        ? App.children.list.helpers.reveal(number - 1, 'center')(model)
        : { model }
    },
  }),
)
