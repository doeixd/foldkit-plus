import { Frame, FrameSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

// Stated once, at module scope: the look every frame of the application
// starts from, and a named preset over it.
const Tray = forSlots(FrameSlots)(Recipes.Frame({ spacing: 'compact' }))
const Roomy = forSlots(FrameSlots)(Recipes.Frame({ spacing: 'roomy', variant: 'outline' }))

const AppFrame = Frame.configure({
  base: { style: Tray, headingLevel: 4 },
  presets: { roomy: { style: Roomy } },
})

export default example({
  title: 'Configure once',
  slots: FrameSlots,
  recipe: Recipes.Frame,
  view: ({ h }) =>
    h.div(
      [],
      [
        AppFrame.view({ title: 'Compact', panels: [h.p([], ['One']), h.p([], ['Two'])] }, h),
        AppFrame.view(
          { title: 'Roomy', panels: [h.p([], ['One']), h.p([], ['Two'])], preset: 'roomy' },
          h,
        ),
      ],
    ),
})
