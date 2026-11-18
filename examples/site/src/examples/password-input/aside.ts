import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, PasswordInput, PasswordInputSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const App = Bundle.compose({ password: Schema.String }).pipe(
  Bundle.withMessages({ Typed: { password: Schema.String } }),
  Bundle.withChild('field', Bundles.PasswordInput, { args: { visible: true } }),
)

// `labelAside` stands beside the label, and
// `words` renames the toggle: both are the application's to draw.
export default example({
  title: 'Sign in, in French',
  slots: PasswordInputSlots,
  recipe: Recipes.PasswordInput,
  state: App.placements.runtime({
    Model: App.Model,
    initial: { password: 'hunter2' },
    update: App.placements.update((model, { password }) => ({
      model: modifyFields(model, { password: () => password }),
    })),
  }),
  view: ({ style, model, onMessage, h }) =>
    PasswordInput.view(
      {
        id: 'sign-in',
        label: 'Mot de passe',
        labelAside: h.span([], ['Oublié ?']),
        words: { toggle: 'Afficher le mot de passe' },
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
