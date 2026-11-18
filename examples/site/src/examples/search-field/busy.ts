import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Recipes, SearchField, SearchFieldSlots, Spinner, SpinnerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Wheel = forSlots(SpinnerSlots)(Recipes.Spinner({ size: 'sm', tone: 'current' }))
const Model = Schema.Struct({ query: Schema.String })
const Message = defineMessageUnion({ Typed: { text: Schema.String }, Cleared: {} })

// `busy` is `aria-busy` and `data-busy`; it draws no spinner, so no page pays
// for one: the application composes its own into `end`. `clear.content`
// replaces the cross with words.
export default example({
  title: 'Busy, with a clear of your own',
  slots: SearchFieldSlots,
  recipe: Recipes.SearchField,
  state: {
    Model,
    Message,
    init: () => ({ model: { query: 'lamp' } }),
    update: (_, message) => ({
      model: { query: Message.match(message, { Typed: ({ text }) => text, Cleared: () => '' }) },
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    SearchField.view(
      {
        id: 'busy',
        label: 'Search products',
        value: model.query,
        busy: model.query !== '',
        end: model.query === '' ? undefined : Spinner.view({ style: Wheel }, h),
        onInput: text => onMessage(Message.Typed({ text })),
        clear: { onClear: onMessage(Message.Cleared()), content: h.span([], ['Reset']) },
        style,
      },
      h,
    ),
})
