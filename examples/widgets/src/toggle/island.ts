import { Runtime } from 'foldkit'
import * as Toggle from './app.js'
import { Toggle as ToggleView, ToggleSlots, runDemo as runToggleDemo } from './view.js'
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
  runDemo: runToggleDemo,
  style: () => toggleStyle(ToggleSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Toggle.Model,
        init: () => ({ model: Toggle.initial }),
        update: Toggle.update,
        view: (model, h) => ToggleView(model, h),
        container,
      }),
    )
  },
}
