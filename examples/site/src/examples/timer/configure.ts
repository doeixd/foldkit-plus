import { Bundles, Recipes, Timer, TimerSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Tiles = forSlots(TimerSlots)(Recipes.Timer({ look: 'tiles', tone: 'neutral' }))

// What every timer of an application starts from: its look, its units and
// its words, said once. A preset is a named set over it, chosen at a use.
const AppTimer = Timer.configure({
  base: {
    style: Tiles,
    units: ['minutes', 'seconds'],
    words: { start: 'Commencer', pause: 'Pause', resume: 'Reprendre', reset: 'Remise à zéro' },
  },
  presets: { stopwatch: { units: ['minutes', 'seconds', 'milliseconds'] } },
})

export default example({
  title: 'Configure once',
  slots: TimerSlots,
  recipe: Recipes.Timer,
  state: Bundles.Timer.with({ id: 'round', interval: 10 }),
  view: ({ model, onMessage, h }) =>
    AppTimer.view({ model, onMessage, label: 'Manche', preset: 'stopwatch' }, h),
})
