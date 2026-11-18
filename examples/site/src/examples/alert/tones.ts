import { Alert, AlertSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const tones = [
  { tone: 'info', title: 'Heads up', description: 'Something worth knowing.' },
  { tone: 'success', title: 'Saved', description: 'Every change is in.' },
  { tone: 'warning', title: 'Almost full', description: 'You have used 90% of your storage.' },
  { tone: 'danger', title: 'Could not publish', description: 'The server did not answer.' },
  { tone: 'neutral', title: 'No changes', description: 'Nothing changed since the last save.' },
  { tone: 'accent', title: 'New: themes', description: 'Pick a look for the whole site.' },
] as const

// One alert per tone, each its own selection of the recipe.
export default example({
  title: 'Every tone',
  slots: AlertSlots,
  recipe: Recipes.Alert,
  view: ({ h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '0.75rem' })],
      tones.map(({ tone, title, description }) =>
        Alert.view(
          {
            layout: 'inline',
            title,
            description,
            style: forSlots(AlertSlots)(Recipes.Alert({ tone })),
          },
          h,
        ),
      ),
    ),
})
