import { Runtime } from 'foldkit'
import * as Command from './app.js'
import { Command as CommandView, CommandSlots, runDemo as runCommandDemo } from './view.js'
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
  runDemo: runCommandDemo,
  style: () => commandStyle(CommandSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Command.Model,
        init: () => Command.initial,
        update: Command.update,
        view: (model, h) => CommandView(model, h),
        container,
      }),
    )
  },
}
