import { Runtime } from 'foldkit'

import * as PickerApp from './app.js'
import { PickerIsland, pickerStyles, runDemo as runPickerDemo } from './view.js'
import { merged, type IslandBody } from '../island.js'

export const island: IslandBody = {
  runDemo: runPickerDemo,
  style: () => merged(...pickerStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: PickerApp.Model,
        init: () => ({ model: PickerApp.initial }),
        update: PickerApp.update,
        view: (model, h) => PickerIsland(model, h),
        container,
      }),
    )
  },
}
