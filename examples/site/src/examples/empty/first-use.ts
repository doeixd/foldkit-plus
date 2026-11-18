import { Button, ButtonSlots, Empty, EmptySlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { forSlots } from '../../snippets/theme.js'

const Action = forSlots(ButtonSlots)(Recipes.Button({}))
const Other = forSlots(ButtonSlots)(Recipes.Button({ variant: 'outline' }))

// First use: a dashed frame where the first item will go.
export default example({
  title: 'First use',
  slots: EmptySlots,
  recipe: Recipes.Empty,
  pins: { frame: 'dashed' },
  view: ({ style, h }) =>
    Empty.view(
      {
        icon: outline(h, 'M2.5 4.5h4l1.5 2h5.5v6h-11z'),
        title: 'No projects yet',
        description: 'Projects hold your pages and the people who edit them.',
        action: h.div(
          [h.Style({ display: 'flex', gap: '0.5rem' })],
          [
            Button.view({ label: 'New project', style: Action }, h),
            Button.view({ label: 'Import', style: Other }, h),
          ],
        ),
        style,
      },
      h,
    ),
})
