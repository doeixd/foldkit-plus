import { Bundles, Recipes, Timer, TimerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// A stopwatch whose Model ticks every 10ms (`interval: 10`), so hundredths
// show; `words` renames the presses.
export default example({
  title: 'Stopwatch',
  slots: TimerSlots,
  recipe: Recipes.Timer,
  state: Bundles.Timer.with({ id: 'lap', interval: 10 }),
  view: ({ style, model, onMessage, h }) =>
    Timer.view(
      {
        model,
        onMessage,
        label: 'Lap',
        units: ['minutes', 'seconds', 'milliseconds'],
        words: { start: 'Go', restart: 'Again' },
        style,
      },
      h,
    ),
})
