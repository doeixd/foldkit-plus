/**
 * The two looks the Picker's examples share: its dropdown is a Listbox and
 * its phone half a Sheet, each a style of its own contract, which the view
 * takes as `listbox` and `sheet`.
 */
import { DialogSlots, ListboxSlots, Recipes } from 'foldkit-mixins-ui'
import { forSlots } from './theme.js'

export const PickerMenu = forSlots(ListboxSlots)(Recipes.Listbox({ width: 'trigger' }))
export const PickerSheet = forSlots(DialogSlots)(Recipes.Sheet({}))
