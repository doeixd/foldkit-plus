import { Button, Recipes, Separator, SeparatorSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'

const Tool = Recipes.Button.style({ tone: 'neutral', variant: 'icon', size: 'sm' })

// Pinned: `Recipes.Separator({ spacing: 'sm', inset: 'sm' })`. Between groups
// of a toolbar's buttons, the rule stops short of the row's height.
export default example({
  title: 'In a toolbar',
  slots: SeparatorSlots,
  recipe: Recipes.Separator,
  pins: { spacing: 'sm', inset: 'sm' },
  view: ({ style, h }) => {
    const tool = (label: string, d: string) =>
      Button.view({ label, icon: outline(h, d), style: Tool }, h)
    return h.div(
      [
        h.Role('group'),
        h.AriaLabel('Formatting'),
        h.Style({ display: 'flex', alignItems: 'center', gap: '0.25rem' }),
      ],
      [
        tool('Bold', 'M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h5a2.75 2.75 0 0 1 0 5.5h-5z'),
        tool('Italic', 'M7 2.5h5M4 13.5h5M10 2.5l-4 11'),
        Separator.view({ orientation: 'vertical', style }, h),
        tool('Align left', 'M2.5 4h11M2.5 8h7M2.5 12h9'),
        tool('Align center', 'M2.5 4h11M4.5 8h7M3.5 12h9'),
      ],
    )
  },
})
