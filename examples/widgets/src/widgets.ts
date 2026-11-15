/**
 * The islands that boot with the page: the toolbar, first on it, and the window
 * list, last, whose thousand rows make it long. Every other section is lazy
 * (`lazy.ts`), so the first load holds only these. Each `mount` closure keeps
 * its own Model and Message types; the registries only read the shared fields.
 */
import { Runtime } from 'foldkit'
import { define, merged } from './island.js'
import * as WindowListApp from './window-list/app.js'
import {
  WindowListIsland,
  windowListStyles,
  runDemo as runWindowListDemo,
} from './window-list/view.js'
import * as Toolbar from './toolbar/app.js'
import {
  BarStyle as ToolbarBarStyle,
  Toolbar as ToolbarView,
  ToolbarSlots,
  ToolStyle as ToolbarToolStyle,
} from './toolbar/view.js'
import { runDemo as runToolbarDemo } from './toolbar/demo.js'
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
} from './style.js'

/** Last on the page: its thousand rows make it long, which is the point. */
export const windowListIsland = define({
  id: WindowListApp.ISLAND,
  title: 'Window list',
  runDemo: runWindowListDemo,
  style: () => merged(...windowListStyles),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: WindowListApp.Model,
        init: () => ({ model: WindowListApp.initial }),
        update: WindowListApp.update,
        view: (model, h) => WindowListIsland(model, h),
        container,
      }),
    )
  },
})

export const islands = [
  define({
    id: 'toolbar',
    title: 'Toolbar',
    runDemo: runToolbarDemo,
    style: () => merged(toolbarStyle(ToolbarSlots), ToolbarBarStyle, ToolbarToolStyle),
    mount: container => {
      Runtime.embed(
        Runtime.makeElement({
          Model: Toolbar.Model,
          init: () => Toolbar.initial,
          update: Toolbar.update,
          view: (model, h) => ToolbarView(model, h),
          container,
        }),
      )
    },
  }),
  windowListIsland,
] as const
