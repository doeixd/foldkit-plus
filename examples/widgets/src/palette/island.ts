import { Runtime } from 'foldkit'
import * as Palette from './app.js'
import { Palette as PaletteView, PaletteSlots, runDemo as runPaletteDemo } from './view.js'
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
  runDemo: runPaletteDemo,
  style: () => paletteStyle(PaletteSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Palette.Model,
        init: () => Palette.initial,
        update: Palette.update,
        view: (model, h) => PaletteView(model, h),
        container,
      }),
    )
  },
}
