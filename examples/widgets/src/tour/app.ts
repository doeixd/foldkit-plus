/**
 * A tour and a floating panel, each opened by a button of the page's. Neither
 * Model keeps its opener: the views carry `focusReturn`, which takes what had
 * focus before the overlay took it and gives it back when the overlay ends.
 * The application keeps how the tour last ended, from the Tour's `Ended`.
 */
import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { FloatingPanel, Tour } from 'foldkit-mixins-ui'

export const ISLAND = 'tour'

export const SEARCH_ID = `${ISLAND}-search`
export const SAVE_ID = `${ISLAND}-save`

export const config: Tour.Config = {
  steps: [
    { title: 'Search', description: 'Find a page by its name.', target: SEARCH_ID },
    { title: 'Save', description: 'Keep what you changed.', target: SAVE_ID, placement: 'top' },
  ],
}

const updateTour = Tour.update(config)
const updatePanel = FloatingPanel.update()

export const Ending = Schema.Literals(['finished', 'skipped'])
export type Ending = typeof Ending.Type

export const Model = Schema.Struct({
  tour: Tour.Model,
  panel: FloatingPanel.Model,
  /** How the tour last ended; none before it has. */
  ending: Schema.Option(Ending),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  StartedTour: {},
  OpenedNotes: {},
  GotTour: { message: Tour.Message },
  GotPanel: { message: FloatingPanel.Message },
})
export type Message = typeof Message.Type

export const initial: Model = {
  tour: Tour.init({ id: `${ISLAND}-tour` }),
  panel: FloatingPanel.init({
    id: `${ISLAND}-notes`,
    rect: { x: 24, y: 96, width: 300, height: 180 },
  }),
  ending: Option.none(),
}

const tourStep = (model: Model, step: Tour.Return): Return<Model, Message> => {
  const ended = Option.fromNullishOr(step.outMessage).pipe(
    Option.map(({ completed }): Ending => (completed ? 'finished' : 'skipped')),
  )
  return {
    model:
      step.model === model.tour && Option.isNone(ended)
        ? model
        : modifyFields(model, {
            tour: () => step.model,
            ending: ending => Option.orElse(ended, () => ending),
          }),
    commands: Command.mapMessages(step.commands ?? [], message => Message.GotTour({ message })),
  }
}

const panelStep = (model: Model, step: FloatingPanel.Return): Return<Model, Message> => ({
  model: step.model === model.panel ? model : modifyFields(model, { panel: () => step.model }),
  commands: Command.mapMessages(step.commands ?? [], message => Message.GotPanel({ message })),
})

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    StartedTour: () => tourStep(model, Tour.start(model.tour, config)),
    OpenedNotes: () => panelStep(model, FloatingPanel.open(model.panel)),
    GotTour: ({ message }) => tourStep(model, updateTour(model.tour, message)),
    GotPanel: ({ message }) => panelStep(model, updatePanel(model.panel, message)),
  })
