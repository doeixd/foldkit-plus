import { Runtime } from 'foldkit'
import * as Sidebar from './app.js'
import { Sidebar as SidebarView, SidebarSlots, runDemo as runSidebarDemo } from './view.js'
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
  runDemo: runSidebarDemo,
  style: () => sidebarStyle(SidebarSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Sidebar.Model,
        init: () => ({ model: Sidebar.initial }),
        update: Sidebar.update,
        view: (model, h) => SidebarView(model, h),
        container,
      }),
    )
  },
}
