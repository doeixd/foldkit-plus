/**
 * The search field child: `SearchField.view` with the application's own key,
 * ArrowDown, answered through the field's keydown owner, and a results region
 * under it once opened.
 */
import { Option } from 'effect'
import { Capability, Slot, Slots, SlotView, Style } from 'foldkit-mixins'
import { Recipes, SearchField, SearchFieldSlots } from 'foldkit-mixins-ui'
import { searchFieldStyle } from '../style.js'
import { SearchMessage, resultsId, type SearchModel } from './child.js'

export const SearchSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  results: Slot.make({ capability: Capability.Container }),
})

export const FieldStyle = Style.forSlots(SearchFieldSlots)(Recipes.SearchField({}))

const openResults: SearchField.Route<SearchMessage> = {
  name: 'Open results',
  key: 'ArrowDown',
  toMessage: () => Option.some(SearchMessage.OpenedResults()),
}

export const SearchView = SlotView.forMessages<SearchMessage>()
  .define(SearchSlots, (model: SearchModel, slots, h) =>
    h.div(slots.root.attrs(), [
      SearchField.view(
        {
          id: model.id,
          label: `Search ${model.id}`,
          value: model.value,
          onInput: value => SearchMessage.Typed({ value }),
          onClear: SearchMessage.Cleared(),
          routes: [openResults],
          style: FieldStyle,
        },
        h,
      ),
      ...(model.resultsOpen
        ? [
            h.div(
              slots.results.attrs([
                h.Id(resultsId(model.id)),
                h.Role('region'),
                h.AriaLabel(`Results for ${model.id}`),
              ]),
              [`Results for ${model.value}`],
            ),
          ]
        : []),
    ]),
  )
  .pipe(Style.attach(searchFieldStyle(SearchSlots)))
