import { Runtime } from 'foldkit'
import * as Progress from './app.js'
import { Progress as ProgressView, ProgressSlots, runDemo as runProgressDemo } from './view.js'
import {
  accordionStyle,
  alertDialogStyle,
  autocompleteStyle,
  checkboxGroupStyle,
  commandStyle,
  contextMenuStyle,
  searchFieldStyle,
  searchPageStyle,
  hoverCardStyle,
  menubarStyle,
  meterStyle,
  navigationMenuStyle,
  nativeSelectStyle,
  numberFieldStyle,
  resizableStyle,
  sidebarStyle,
  otpFieldStyle,
  paletteStyle,
  progressStyle,
  toggleGroupStyle,
  toggleStyle,
  toolbarStyle,
} from '../style.js'
import type { IslandBody } from '../island.js'

export const island: IslandBody = {
  runDemo: runProgressDemo,
  style: () => progressStyle(ProgressSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Progress.Model,
        init: () => ({ model: Progress.initial }),
        update: Progress.update,
        view: (model, h) => ProgressView(model, h),
        container,
      }),
    )
  },
}
