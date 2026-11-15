import { Runtime } from 'foldkit'
import * as NumberField from './app.js'
import {
  NumberField as NumberFieldView,
  NumberFieldSlots,
  runDemo as runNumberFieldDemo,
} from './view.js'
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
  runDemo: runNumberFieldDemo,
  style: () => numberFieldStyle(NumberFieldSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: NumberField.Model,
        init: () => ({ model: NumberField.initial }),
        update: NumberField.update,
        view: (model, h) => NumberFieldView(model, h),
        container,
      }),
    )
  },
}
