import { Runtime } from 'foldkit'
import * as Autocomplete from './app.js'
import {
  Autocomplete as AutocompleteView,
  AutocompleteSlots,
  runDemo as runAutocompleteDemo,
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
  runDemo: runAutocompleteDemo,
  style: () => autocompleteStyle(AutocompleteSlots),
  mount: container => {
    Runtime.embed(
      Runtime.makeElement({
        Model: Autocomplete.Model,
        init: () => Autocomplete.initial,
        update: Autocomplete.update,
        view: (model, h) => AutocompleteView(model, h),
        container,
      }),
    )
  },
}
