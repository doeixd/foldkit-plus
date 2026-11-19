import { Recipes, ThinkingIndicator, ThinkingIndicatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Calm = Recipes.ThinkingIndicator.style({ mark: 'pulse', label: 'plain', tone: 'accent' })

// The application's look and its word for the wait, said once; a use names a
// preset or gives its own `label`.
const AppThinking = ThinkingIndicator.configure({
  base: { style: Calm, label: 'Denkt nach' },
  presets: { search: { label: 'Sucht' } },
})

export default example({
  title: 'Configure once',
  slots: ThinkingIndicatorSlots,
  recipe: Recipes.ThinkingIndicator,
  view: ({ h }) => AppThinking.view({ preset: 'search', detail: 'Im Web' }, h),
})
