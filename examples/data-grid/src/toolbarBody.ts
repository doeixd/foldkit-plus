/** The toolbar's widgets, loaded on demand: a search over the products and the row density. */
import { Option } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Style } from 'foldkit-mixins'
import {
  Recipes,
  SearchField,
  SearchFieldSlots,
  Segmented,
  SegmentedSlots,
} from 'foldkit-mixins-ui'
import { formatHotkey } from 'foldkit-primitives/events'
import { type Platform, platformFromUA } from 'foldkit-primitives/media'
import { modifyFields } from 'foldkit/struct'
import * as Submodel from 'foldkit/submodel'
import { Density, ToolbarMessage, type ToolbarModel } from './toolbar.js'

const FieldStyle = Style.forSlots(SearchFieldSlots)(Recipes.SearchField({}))
const DensityStyle = Style.forSlots(SegmentedSlots)(Recipes.Segmented({ tray: 'tray', size: 'sm' }))

/** What the grid answers to, as `formatHotkey` writes each for a platform: `⌘C` on a Mac, `Ctrl+C` elsewhere. */
export const shortcuts = (
  platform: Platform,
): ReadonlyArray<{ readonly keys: string; readonly does: string }> =>
  [
    ['Enter', 'Edit the cell'],
    ['Escape', 'Leave an edit as it was'],
    ['Shift+ArrowDown', 'Grow a range of cells'],
    ['Mod+C', 'Copy the range'],
    ['Mod+V', 'Paste from a spreadsheet'],
    ['Mod+D', 'Fill the range down'],
    ['Mod+A', 'Select every product'],
    ['Alt+ArrowDown', 'Filter the focused column'],
  ].map(([pattern, does]) => ({
    keys: Option.getOrElse(formatHotkey(pattern!, platform), () => pattern!),
    does: does!,
  }))

const platform = platformFromUA(typeof navigator === 'undefined' ? '' : navigator.userAgent)

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
            placeholder: 'Search products',
            value: model.search,
            onInput: text => ToolbarMessage.Typed({ text }),
            clear: { onClear: ToolbarMessage.Cleared() },
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
        // Native disclosure: Enter and Space open it, and it keeps no state of ours.
        h.details(
          [],
          [
            h.summary(
              [
                h.Style({
                  cursor: 'pointer',
                  minHeight: '2.5rem',
                  display: 'flex',
                  alignItems: 'center',
                }),
              ],
              ['Keyboard shortcuts'],
            ),
            h.dl(
              [
                h.Style({
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr',
                  gap: '0.25rem 1rem',
                  margin: '0',
                }),
              ],
              shortcuts(platform).flatMap(row => [
                h.dt([h.Style({ fontWeight: '600' })], [row.keys]),
                h.dd([h.Style({ margin: '0' })], [row.does]),
              ]),
            ),
          ],
        ),
      ],
    ),
  ),
}
