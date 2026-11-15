import { Runtime } from 'foldkit'
import * as ContextMenu from './app.js'
import {
  ContextMenu as ContextMenuView,
  ContextMenuSlots,
  runDemo as runContextMenuDemo,
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
  runDemo: runContextMenuDemo,
  style: () => contextMenuStyle(ContextMenuSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: ContextMenu.Model,
        init: () => ContextMenu.initial,
        update: ContextMenu.update,
        view: (model, h) => ContextMenuView(model, h),
        container,
      }),
    )
  },
}
