import { Runtime } from 'foldkit'
import * as NavigationMenu from './app.js'
import {
  NavigationMenu as NavigationMenuView,
  NavigationMenuSlots,
  runDemo as runNavigationMenuDemo,
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
  runDemo: runNavigationMenuDemo,
  style: () => navigationMenuStyle(NavigationMenuSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: NavigationMenu.Model,
        init: () => NavigationMenu.initial,
        update: NavigationMenu.update,
        subscriptions: NavigationMenu.subscriptions,
        view: (model, h) => NavigationMenuView(model, h),
        container,
      }),
    )
  },
}
