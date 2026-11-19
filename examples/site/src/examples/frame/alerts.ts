import { Alert, Frame, FrameSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

const Notice = Recipes.Alert.style({ tone: 'warning' })
const Failure = Recipes.Alert.style({ tone: 'danger' })

// Composition: the frame places what it is given and understands none of it.
// Each Alert is drawn by its own widget, in its own tone.
export default example({
  title: 'Alerts in a frame',
  slots: FrameSlots,
  recipe: Recipes.Frame,
  pins: { variant: 'outline', padding: 'none' },
  view: ({ style, h }) =>
    Frame.view(
      {
        title: 'Needs attention',
        panels: [
          Alert.view({ layout: 'inline', title: 'Your card expires next month', style: Notice }, h),
          Alert.view(
            {
              layout: 'inline',
              title: 'The last backup failed',
              description: 'Retry it now.',
              style: Failure,
            },
            h,
          ),
        ],
        style,
      },
      h,
    ),
})
