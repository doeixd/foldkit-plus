import { Bundles, Recipes, Timer, TimerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The time counted is the Bundle's Model; its ticks are Commands that read
// Effect's clock, so the count stays the clock's however late a tick lands.
// With a `duration` the root carries how much of it is counted, which the
// recipe's `progress: 'bar'` draws.
export default example({
  title: 'Countdown',
  slots: TimerSlots,
  recipe: Recipes.Timer,
  pins: { progress: 'bar' },
  state: Bundles.Timer.with({ id: 'tea', countdown: true, duration: 3 * 60_000 }),
  view: ({ style, model, onMessage, h }) =>
    Timer.view({ model, onMessage, label: 'Tea', units: ['minutes', 'seconds'], style }, h),
})
