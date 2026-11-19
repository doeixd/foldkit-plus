import { Button, Frame, FrameSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Quiet = Recipes.Button.style({ tone: 'neutral', variant: 'outline', size: 'sm' })

// A tray with a heading, an action and a note, holding one panel for each
// thing that belongs with the others. Each panel is a surface of its own, so
// what it holds needs no border.
export default example({
  title: 'A tray of panels',
  slots: FrameSlots,
  recipe: Recipes.Frame,
  view: ({ style, h }) =>
    Frame.view(
      {
        title: 'Deployments',
        description: 'Everything shipped this week.',
        action: Button.view({ label: 'View all', style: Quiet }, h),
        panels: [
          h.p([], ['Production, from main, 4 minutes ago']),
          h.p([], ['Preview, from the billing branch, yesterday']),
          h.p([], ['Production, from main, 2 days ago']),
        ],
        footer: h.span([], ['Updated just now']),
        style,
      },
      h,
    ),
})
