import { Runtime } from 'foldkit'
import * as Meter from './app.js'
import { Meter as MeterView, MeterSlots, runDemo as runMeterDemo } from './view.js'
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
  runDemo: runMeterDemo,
  style: () => meterStyle(MeterSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Meter.Model,
        init: () => ({ model: Meter.initial }),
        update: Meter.update,
        view: (model, h) => MeterView(model, h),
        container,
      }),
    )
  },
}
