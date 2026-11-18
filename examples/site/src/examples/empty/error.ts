import { Button, ButtonSlots, Empty, EmptySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({}))

// A load that failed: the icon in the error's ink, and a retry.
export default example({
  title: 'An error',
  slots: EmptySlots,
  recipe: Recipes.Empty,
  pins: { tone: 'danger', frame: 'filled' },
  view: ({ style, h }) =>
    Empty.view(
      {
        icon: outline(h, 'M8 2l6.5 11.5h-13zM8 6.5v3M8 11.5v.01'),
        title: 'Could not load your projects',
        description: 'The server did not answer. Your work is safe.',
        action: Button.view({ label: 'Try again', style: Action }, h),
        style,
      },
      h,
    ),
})
