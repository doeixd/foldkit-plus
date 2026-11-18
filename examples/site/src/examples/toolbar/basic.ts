import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Button, ButtonSlots, Recipes, Toolbar, ToolbarSlots } from 'foldkit-mixins-ui'
import type { ToolbarControl } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Tool = forSlots(ButtonSlots)(Recipes.Button({ tone: 'neutral', variant: 'outline' }))

// Which tools are on is the application's; where the one tab stop is belongs
// to the Toolbar's Bundle.
const App = Bundle.compose({ on: Schema.Array(Schema.String) }).pipe(
  Bundle.withMessages({ Pressed: { id: Schema.String } }),
  Bundle.withChild('bar', Bundles.Toolbar, { args: {} }),
)

export default example({
  title: 'Formatting',
  slots: ToolbarSlots,
  recipe: Recipes.Toolbar,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { on: ['Bold'] },
    update: App.placements.update((model, { id }) => ({
      model: modifyFields(model, {
        on: on => (on.includes(id) ? on.filter(each => each !== id) : [...on, id]),
      }),
    })),
  }),
  view: ({ style, model, onMessage, h }) => {
    // A control is the application's own Button, handed the stop's attributes.
    const one = (
      label: string,
      disabled = false,
    ): ToolbarControl<ReturnType<typeof onMessage>> => ({
      id: label,
      disabled,
      draw: stop =>
        Button.view(
          {
            label,
            pressed: model.on.includes(label),
            disabled: stop.disabled,
            onClick: onMessage(App.Message.Pressed({ id: label })),
            attributes: { button: stop.attributes },
            style: Tool,
          },
          h,
        ),
    })
    return Toolbar.view(
      {
        id: 'format',
        label: 'Text formatting',
        roving: model.bar,
        onFocus: Toolbar.focused(message => onMessage(App.Message.GotBarMessage({ message }))),
        items: [one('Bold'), one('Italic'), 'separator', one('Link', true)],
        style,
      },
      h,
    )
  },
})
