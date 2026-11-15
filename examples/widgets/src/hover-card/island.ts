import { Runtime } from 'foldkit'
import * as HoverCard from './app.js'
import { HoverCard as HoverCardView, HoverCardSlots, runDemo as runHoverCardDemo } from './view.js'
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
  runDemo: runHoverCardDemo,
  style: () => hoverCardStyle(HoverCardSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: HoverCard.Model,
        init: () => HoverCard.initial,
        update: HoverCard.update,
        view: (model, h) => HoverCardView(model, h),
        container,
      }),
    )
  },
}
