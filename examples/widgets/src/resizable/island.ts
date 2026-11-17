import { Runtime } from 'foldkit'
import * as Resizable from './app.js'
import { Resizable as ResizableView, ResizableSlots, runDemo as runResizableDemo } from './view.js'
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
  runDemo: runResizableDemo,
  style: () => resizableStyle(ResizableSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Resizable.Model,
        init: () => ({ model: Resizable.initial }),
        update: Resizable.update,
        view: (model, h) => ResizableView(model, h),
        container,
      }),
    )
  },
}
