import { Runtime } from 'foldkit'
import * as NativeSelect from './app.js'
import {
  NativeSelect as NativeSelectView,
  NativeSelectSlots,
  runDemo as runNativeSelectDemo,
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
  runDemo: runNativeSelectDemo,
  style: () => nativeSelectStyle(NativeSelectSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: NativeSelect.Model,
        init: () => ({ model: NativeSelect.initial }),
        update: NativeSelect.update,
        view: (model, h) => NativeSelectView(model, h),
        container,
      }),
    )
  },
}
