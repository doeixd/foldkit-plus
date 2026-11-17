import { Runtime } from 'foldkit'
import * as AlertDialog from './app.js'
import {
  AlertDialog as AlertDialogView,
  AlertDialogSlots,
  runDemo as runAlertDialogDemo,
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
  runDemo: runAlertDialogDemo,
  style: () => alertDialogStyle(AlertDialogSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: AlertDialog.Model,
        init: () => AlertDialog.initial,
        update: AlertDialog.update,
        subscriptions: AlertDialog.subscriptions,
        view: (model, h) => AlertDialogView(model, h),
        container,
      }),
    )
  },
}
