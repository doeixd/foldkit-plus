import { Runtime } from 'foldkit'
import { type IslandBody, merged } from '../island.js'
import { Model, initial, update } from './app.js'
import { ButtonStyle, TableIsland, TableStyle, runDemo } from './view.js'

export const island: IslandBody = {
  runDemo,
  style: () => merged(TableStyle, ButtonStyle),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model,
        init: () => ({ model: initial }),
        update,
        view: (model, h) => TableIsland(model, h),
        container,
      }),
    )
  },
}
