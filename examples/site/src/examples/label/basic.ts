import { Input, InputSlots, Label, LabelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Field = forSlots(InputSlots)(Recipes.Input({}))

// `for` is the id the control carries. Pass the one `FieldAssociation`
// derived, so there is no second naming scheme beside it.
export default example({
  title: 'Basic',
  slots: LabelSlots,
  recipe: Recipes.Label,
  view: ({ style, h }) =>
    stack(h, [
      Label.view({ for: 'label-email', text: 'Email address', style }, h),
      Input.view(
        {
          id: 'label-email',
          type: 'email',
          style: Field,
          draw: (resolved, h) => h.input(resolved.input),
        },
        h,
      ),
    ]),
})
