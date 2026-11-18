import { Button, ButtonGroup, ButtonGroupSlots, ButtonSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { outline } from '../../snippets/icon.js'
import { row } from '../../snippets/layout.js'
import { forSlots } from '../../snippets/theme.js'

const Square = forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline', shape: 'square' }),
)

const history = [
  { label: 'Undo', icon: 'M5.5 3.5L2.5 6.5l3 3M2.5 6.5h7a3.5 3.5 0 0 1 0 7h-2' },
  { label: 'Redo', icon: 'M10.5 3.5l3 3-3 3M13.5 6.5h-7a3.5 3.5 0 0 0 0 7h2' },
]
const marks = [
  {
    label: 'Bold',
    icon: 'M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h5a2.75 2.75 0 0 1 0 5.5h-5z',
  },
  { label: 'Italic', icon: 'M7 2.5h5M4 13.5h5M10 2.5l-4 11' },
  { label: 'Underline', icon: 'M4.5 2.5v5a3.5 3.5 0 0 0 7 0v-5M3.5 14h9' },
]
const alignments = [
  { label: 'Align left', icon: 'M2 3.5h12M2 6.5h8M2 9.5h12M2 12.5h8' },
  { label: 'Align center', icon: 'M2 3.5h12M4 6.5h8M2 9.5h12M4 12.5h8' },
  { label: 'Align right', icon: 'M2 3.5h12M6 6.5h8M2 9.5h12M6 12.5h8' },
]

// Groups of groups: each joins its own buttons, and a gap keeps them apart.
export default example({
  title: 'Toolbar',
  slots: ButtonGroupSlots,
  recipe: Recipes.ButtonGroup,
  view: ({ style, h }) => {
    const group = (label: string, items: ReadonlyArray<{ label: string; icon: string }>) =>
      ButtonGroup.view(
        {
          label,
          items: items.map(item =>
            Button.view({ label: item.label, icon: outline(h, item.icon), style: Square }, h),
          ),
          style,
        },
        h,
      )
    return row(h, [
      group('History', history),
      group('Marks', marks),
      group('Alignment', alignments),
    ])
  },
})
