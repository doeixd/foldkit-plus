import { Runtime } from 'foldkit'
import * as OtpField from './app.js'
import { OtpField as OtpFieldView, OtpFieldSlots, runDemo as runOtpFieldDemo } from './view.js'
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
  runDemo: runOtpFieldDemo,
  style: () => otpFieldStyle(OtpFieldSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: OtpField.Model,
        init: () => OtpField.initial,
        update: OtpField.update,
        view: (model, h) => OtpFieldView(model, h),
        container,
      }),
    )
  },
}
