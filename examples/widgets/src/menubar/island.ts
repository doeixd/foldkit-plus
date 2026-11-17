import { Runtime } from 'foldkit'
import * as Menubar from './app.js'
import { Menubar as MenubarView, MenubarSlots, runDemo as runMenubarDemo } from './view.js'
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
  runDemo: runMenubarDemo,
  style: () => menubarStyle(MenubarSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Menubar.Model,
        init: () => Menubar.initial,
        update: Menubar.update,
        view: (model, h) => MenubarView(model, h),
        container,
      }),
    )
  },
}
