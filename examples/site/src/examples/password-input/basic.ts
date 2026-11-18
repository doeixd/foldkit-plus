import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, PasswordInput, PasswordInputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The text is the application's own field; whether it shows is the
// PasswordInput's, so the Bundle holds that and `controls` hands it to the view.
const App = Bundle.compose({ password: Schema.String }).pipe(
  Bundle.withMessages({ Typed: { password: Schema.String } }),
  Bundle.withChild('field', Bundles.PasswordInput, { args: {} }),
)

export default example({
  title: 'Basic',
  slots: PasswordInputSlots,
  recipe: Recipes.PasswordInput,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { password: '' },
    update: App.placements.update((model, { password }) => ({
      model: modifyFields(model, { password: () => password }),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    PasswordInput.view(
      {
        id: 'password',
        label: 'Password',
        description: 'At least twelve characters.',
        value: model.password,
        onInput: password => onMessage(App.Message.Typed({ password })),
        ...PasswordInput.controls(model.field, message =>
          onMessage(App.Message.GotFieldMessage({ message })),
        ),
        style,
      },
      h,
    ),
})
