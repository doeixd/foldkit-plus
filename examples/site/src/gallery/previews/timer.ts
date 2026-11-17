import type { NamedStyle } from 'foldkit-mixins'
import { Recipes, TimerSlots } from 'foldkit-mixins-ui'
import * as Snippet from '../../snippets/components.js'
import * as Widgets from '../widgets.js'
import { about } from '../catalogue.js'
import { fromRecipe } from '../define.js'
import type { Live } from '../showcase.js'

const timerCountdown = <Message>(style: NamedStyle<typeof TimerSlots>, live: Live<Message>) =>
  Snippet.timerCountdown(
    style,
    live.widgets.tea,
    message => live.onWidget(Widgets.Message.GotTea({ message })),
    live.h,
  )

export const showcase = fromRecipe(
  about('timer'),
  TimerSlots,
  Recipes.Timer,
  timerCountdown,
  undefined,
  [
    { name: 'countdown', title: 'Countdown', draw: timerCountdown },
    {
      name: 'stopwatch',
      title: 'Stopwatch',
      draw: (style, live) =>
        Snippet.timerStopwatch(
          style,
          live.widgets.lap,
          message => live.onWidget(Widgets.Message.GotLap({ message })),
          live.h,
        ),
    },
  ],
)
