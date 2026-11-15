import { Runtime } from 'foldkit'
import * as Accordion from './app.js'
import { Accordion as AccordionView, AccordionSlots, runDemo as runAccordionDemo } from './view.js'
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
  runDemo: runAccordionDemo,
  style: () => accordionStyle(AccordionSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Accordion.Model,
        init: () => ({ model: Accordion.initial }),
        update: Accordion.update,
        view: (model, h) => AccordionView(model, h),
        container,
      }),
    )
  },
}
