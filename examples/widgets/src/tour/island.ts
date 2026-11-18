import * as Runtime from 'foldkit/runtime'
import { FloatingPanel, Tour } from 'foldkit-mixins-ui'
import { merged, type IslandBody } from '../island.js'
import { Message, Model, initial, update } from './app.js'
import { TourIsland, said, tourStyles } from './view.js'

const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: tour open=${model.tour.open} notes open=${model.panel.open}`]
  const step = (label: string, message: Message) => {
    model = update(model, message).model
    lines.push(`${label}: tour step=${model.tour.step} open=${model.tour.open}; ${said(model)}`)
  }
  step('started the tour', Message.StartedTour())
  step('Next', Message.GotTourMessage({ message: Tour.Message.Next() }))
  step('Skip', Message.GotTourMessage({ message: Tour.Message.Skipped() }))
  model = update(model, Message.OpenedNotes()).model
  lines.push(`opened the notes: open=${model.panel.open}`)
  model = update(model, Message.GotPanelMessage({ message: FloatingPanel.Message.Closed() })).model
  lines.push(`closed the notes: open=${model.panel.open}`)
  return lines
}

export const island: IslandBody = {
  runDemo,
  style: () => merged(...tourStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: (model, h) => TourIsland(model, h),
        container,
      }),
    )
  },
}
