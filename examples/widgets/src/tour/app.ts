/**
 * A tour and a floating panel, each opened by a button of the page's. Both are
 * `foldkit-mixins-ui` Bundles placed in this application. Neither Model keeps
 * its opener: the views carry `focusReturn`, which takes what had focus before
 * the overlay took it and gives it back when the overlay ends. The application
 * keeps how the tour last ended, from the Tour's `Ended`, which it answers
 * where the Tour is placed.
 */
import { Match, Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles } from 'foldkit-mixins-ui'
import type { Tour } from 'foldkit-mixins-ui'

export const ISLAND = 'tour'

export const SEARCH_ID = `${ISLAND}-search`
export const SAVE_ID = `${ISLAND}-save`

const steps: Tour.Config['steps'] = [
  { title: 'Search', description: 'Find a page by its name.', target: SEARCH_ID },
  { title: 'Save', description: 'Keep what you changed.', target: SAVE_ID, placement: 'top' },
]

export const Ending = Schema.Literals(['finished', 'skipped'])
export type Ending = typeof Ending.Type

export const App = Bundle.compose({
  /** How the tour last ended; none before it has. */
  ending: Schema.Option(Ending),
}).pipe(
  Bundle.withMessages({ StartedTour: {}, OpenedNotes: {} }),
  Bundle.withChild('tour', Bundles.Tour, {
    args: { id: `${ISLAND}-tour`, steps },
    onOut:
      ({ completed }) =>
      model => ({
        model: modifyFields(model, {
          ending: () => Option.some<Ending>(completed ? 'finished' : 'skipped'),
        }),
      }),
  }),
  Bundle.withChild('panel', Bundles.FloatingPanel, {
    args: { id: `${ISLAND}-notes`, rect: { x: 24, y: 96, width: 300, height: 180 } },
    onOut: Bundle.ignore,
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({ ending: Option.none() }).model

const { tour, panel } = App.children

export const update = App.placements.update((model, message) =>
  Match.valueTags(message, {
    StartedTour: () => tour.helpers.start()(model),
    OpenedNotes: () => panel.helpers.open()(model),
  }),
)
