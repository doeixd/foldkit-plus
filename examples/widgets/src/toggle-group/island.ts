import { Runtime } from 'foldkit'
import * as ToggleGroup from './app.js'
import {
  ToggleGroup as ToggleGroupView,
  ToggleGroupSlots,
  runDemo as runToggleGroupDemo,
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
  runDemo: runToggleGroupDemo,
  style: () => toggleGroupStyle(ToggleGroupSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: ToggleGroup.Model,
        init: () => ToggleGroup.initial,
        update: ToggleGroup.update,
        view: (model, h) => ToggleGroupView(model, h),
        container,
      }),
    )
  },
}
