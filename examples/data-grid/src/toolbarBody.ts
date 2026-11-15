/** The toolbar's widgets, loaded on demand: a search over the products and the row density. */
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import {
  Recipes,
  SearchField,
  SearchFieldSlots,
  Segmented,
  SegmentedSlots,
} from 'foldkit-mixins-ui'
import { modifyFields } from 'foldkit/struct'
import * as Submodel from 'foldkit/submodel'
import { Density, ToolbarMessage, type ToolbarModel } from './toolbar.js'

const FieldStyle = Style.forSlots(SearchFieldSlots)(Recipes.SearchField({}))
const DensityStyle = Style.forSlots(SegmentedSlots)(Recipes.Segmented({ tray: 'tray', size: 'sm' }))

const densities = Density.members.map(member => member.literal)

export const body: Bundle.Body<ToolbarModel, ToolbarMessage, void, never, never, void> = {
  update: (model, message) =>
    ToolbarMessage.match(message, {
      Typed: ({ text }) =>
        text === model.search ? { model } : { model: modifyFields(model, { search: () => text }) },
      Cleared: () => ({
        model: model.search === '' ? model : modifyFields(model, { search: () => '' }),
        commands: [SearchField.Focus({ id: 'search' })],
      }),
      Picked: ({ density }) =>
        density === model.density
          ? { model }
          : { model: modifyFields(model, { density: () => density }) },
      Loaded: () => ({ model }),
      CompletedFocus: () => ({ model }),
    }),
  view: Submodel.defineView<ToolbarModel, ToolbarMessage>((model, h) =>
    h.div(
      [
        h.Style({
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: '0.5rem',
          margin: '0 0 0.75rem',
        }),
      ],
      [
        SearchField.view(
          {
            id: 'search',
            label: 'Search products',
            placeholder: 'Search description, line or UPC',
            value: model.search,
            onInput: text => ToolbarMessage.Typed({ text }),
            onClear: ToolbarMessage.Cleared(),
            style: FieldStyle,
          },
          h,
        ),
        Segmented.view(
          {
            id: 'density',
            label: 'Row density',
            options: densities.map(value => ({ value, label: value })),
            pressed: [model.density],
            onPress: density => ToolbarMessage.Picked({ density }),
            style: DensityStyle,
          },
          h,
        ),
      ],
    ),
  ),
}
