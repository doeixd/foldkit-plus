import { Option } from 'effect'
import { Bundles, Button, Calendar, CalendarSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { note, row } from '../../snippets/layout.js'
import { today } from '../../snippets/today.js'

const ClearStyle = Recipes.Button.style({ tone: 'neutral', variant: 'outline', size: 'sm' })

// Any number of days: each press adds a day or takes it away again. Clearing
// is a pick of the empty selection, sent as the Calendar's own Message.
export default example({
  title: 'Several days',
  slots: CalendarSlots,
  recipe: Recipes.Calendar,
  state: Bundles.Calendar.with({ id: 'several', today, selection: Calendar.empty('Multiple') }),
  view: ({ style, model, onMessage, h }) => {
    const count = Calendar.Selection.match(model.selection, {
      Single: ({ date }) => (Option.isSome(date) ? 1 : 0),
      Range: () => 0,
      Multiple: ({ dates }) => dates.length,
    })
    return Calendar.view(
      {
        model,
        onMessage,
        label: 'Days off',
        footer: row(h, [
          note(h, [count === 1 ? '1 day chosen' : `${count} days chosen`]),
          Button.view(
            {
              label: 'Clear',
              disabled: count === 0,
              onClick: onMessage(
                Calendar.Message.PickedPreset({ selection: Calendar.empty('Multiple') }),
              ),
              style: ClearStyle,
            },
            h,
          ),
        ]),
        style,
      },
      h,
    )
  },
})
