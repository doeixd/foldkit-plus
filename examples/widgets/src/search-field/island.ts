import { Runtime } from 'foldkit'

import * as SearchFieldApp from './app.js'
import { SearchFieldIsland, SearchPageSlots, runDemo as runSearchFieldDemo } from './demo.js'
import { FieldStyle as SearchFieldRecipe, SearchSlots } from './view.js'
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
import { merged, type IslandBody } from '../island.js'

export const island: IslandBody = {
  runDemo: runSearchFieldDemo,
  style: () =>
    merged(searchPageStyle(SearchPageSlots), searchFieldStyle(SearchSlots), SearchFieldRecipe),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: SearchFieldApp.Model,
        init: () => ({ model: SearchFieldApp.initial }),
        update: SearchFieldApp.update,
        view: (model, h) => SearchFieldIsland(model, h),
        container,
      }),
    )
  },
}
