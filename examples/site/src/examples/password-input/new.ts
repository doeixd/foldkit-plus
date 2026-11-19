import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Meter, PasswordInput, PasswordInputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Gauge = Recipes.Meter.style({})
const App = Bundle.compose({ password: Schema.String }).pipe(
  Bundle.withMessages({ Typed: { password: Schema.String } }),
  Bundle.withChild('field', Bundles.PasswordInput, { args: {} }),
)

// A strength Meter over the rules kept, the rules listed under the field,
// and a hint while Caps Lock is on, read from each key typed. The Meter is
// the application's drawing, so a page with none ships no Meter.
export default example({
  title: 'A new password',
  slots: PasswordInputSlots,
  recipe: Recipes.PasswordInput,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { password: '' },
    update: App.placements.update((model, { password }) => ({
      model: modifyFields(model, { password: () => password }),
    })),
  }),
  view: ({ style, model, onMessage, h }) => {
    const rules = [
      { label: 'At least 12 characters', met: model.password.length >= 12 },
      { label: 'A number', met: /[0-9]/.test(model.password) },
      { label: 'A symbol', met: /[^a-zA-Z0-9]/.test(model.password) },
    ]
    return PasswordInput.view(
      {
        id: 'new-password',
        label: 'New password',
        autocomplete: 'new-password',
        value: model.password,
        onInput: password => onMessage(App.Message.Typed({ password })),
        ...PasswordInput.controls(model.field, message =>
          onMessage(App.Message.GotFieldMessage({ message })),
        ),
        strength: Meter.view(
          {
            id: 'strength',
            label: 'Strength',
            value: rules.filter(rule => rule.met).length,
            max: 3,
            style: Gauge,
          },
          h,
        ),
        requirements: rules,
        style,
      },
      h,
    )
  },
})
