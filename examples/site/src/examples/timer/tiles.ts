import { Bundles, Recipes, Timer, TimerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A countdown in days, hours and minutes, each unit its own tile: the
// recipe's `look: 'tiles'`, over the same markup. With `controls: false` no
// presses are drawn, and the application sends `Pressed` itself.
export default example({
  title: 'Tiles, without controls',
  slots: TimerSlots,
  recipe: Recipes.Timer,
  pins: { look: 'tiles' },
  state: Bundles.Timer.with({ id: 'launch', countdown: true, duration: 2 * 86_400_000 }),
  view: ({ style, model, onMessage, h }) =>
    Timer.view(
      {
        model,
        onMessage,
        label: 'Launch in',
        units: ['days', 'hours', 'minutes'],
        controls: false,
        style,
      },
      h,
    ),
})
