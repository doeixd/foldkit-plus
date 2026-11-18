import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Behaviors } from 'foldkit-mixins'
import { Recipes, SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const dishes = ['Apple pie', 'Apple crumble', 'Baked apples', 'Pear tart', 'Plum cake']
const Model = Schema.Struct({ query: Schema.String, active: Schema.Number })
const Message = defineMessageUnion({ Typed: { text: Schema.String }, Next: {} })
const matches = (query: string) => dishes.filter(dish => dish.toLowerCase().includes(query.trim()))

// A key of the application's own shares the field's one keydown owner with
// Escape: ArrowDown moves to the next result, but only once there is text.
export default example({
  title: 'Keys of your own',
  slots: SearchFieldSlots,
  recipe: Recipes.SearchField,
  state: {
    Model,
    Message,
    init: () => ({ model: { query: '', active: 0 } }),
    update: (model, message) =>
      Message.match(message, {
        Typed: ({ text }) => ({ model: { query: text, active: 0 } }),
        Next: () => ({
          model: modifyFields(model, { active: at => (at + 1) % matches(model.query).length }),
        }),
      }),
  },
  view: ({ style, model, onMessage, h }) =>
    h.div(
      [],
      [
        SearchField.view(
          {
            id: 'dishes',
            label: 'Find a dish',
            placeholder: 'Type apple, then press the down arrow',
            value: model.query,
            onInput: text => onMessage(Message.Typed({ text })),
            routes: [
              Behaviors.Keys.route('Next', {
                on: [Behaviors.Keys.chord('ArrowDown')],
                handle: ({ input }) =>
                  input === '' ? Option.none() : Option.some(onMessage(Message.Next())),
              }),
            ],
            style,
          },
          h,
        ),
        h.ul(
          [],
          matches(model.query).map((dish, at) =>
            h.li([h.Key(dish), ...(at === model.active ? [h.AriaCurrent('true')] : [])], [dish]),
          ),
        ),
      ],
    ),
})
