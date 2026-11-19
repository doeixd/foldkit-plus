import { Input, Label, LabelSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { stack } from '../../snippets/layout.js'

const Field = Recipes.Input.style({})

// `required` draws a star the screen reader skips (the control itself says it
// is required); `optional` says so in words that are read. A field is one or
// the other.
export default example({
  title: 'Required and optional',
  slots: LabelSlots,
  recipe: Recipes.Label,
  view: ({ style, h }) =>
    stack(h, [
      Label.view({ for: 'label-name', text: 'Full name', required: true, style }, h),
      Input.view(
        { id: 'label-name', style: Field, draw: (resolved, h) => h.input(resolved.input) },
        h,
      ),
      Label.view({ for: 'label-nick', text: 'Nickname', optional: true, style }, h),
      Input.view(
        { id: 'label-nick', style: Field, draw: (resolved, h) => h.input(resolved.input) },
        h,
      ),
    ]),
})
