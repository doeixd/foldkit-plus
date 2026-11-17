import { Runtime } from 'foldkit'
import * as CheckboxGroup from './app.js'
import {
  CheckboxGroup as CheckboxGroupView,
  CheckboxGroupSlots,
  runDemo as runCheckboxGroupDemo,
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
  runDemo: runCheckboxGroupDemo,
  style: () => checkboxGroupStyle(CheckboxGroupSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: CheckboxGroup.Model,
        init: () => CheckboxGroup.initial,
        update: CheckboxGroup.update,
        view: (model, h) => CheckboxGroupView(model, h),
        container,
      }),
    )
  },
}
