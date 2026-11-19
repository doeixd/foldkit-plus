import { Button, Recipes, Separator, SeparatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Face = Recipes.Button.style({ tone: 'neutral', variant: 'outline' })

// Words in the middle of the rule, read as text; the rules either side are drawing.
export default example({
  title: 'A label',
  slots: SeparatorSlots,
  recipe: Recipes.Separator,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '1rem', inlineSize: 'min(100%, 20rem)' })],
      [
        Button.view({ label: 'Continue with a passkey', style: Face }, h),
        Separator.view({ label: 'or', style }, h),
        Button.view({ label: 'Continue with email', style: Face }, h),
      ],
    ),
})
