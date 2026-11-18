import { Bundle } from 'foldkit-bundle'
import {
  Bundles,
  ColorPicker,
  ColorPickerSlots,
  PopoverSlots,
  Recipes,
  SliderSlots,
} from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Channel = forSlots(SliderSlots)(Recipes.Slider({ track: 'paint', label: 'hidden' }))
const Panel = forSlots(PopoverSlots)(Recipes.Popover({}))

const accents: ReadonlyArray<ColorPicker.ColorPickerPreset> = [
  { label: 'Blue', value: ColorPicker.color('#3b82f6') },
  { label: 'Rose', value: ColorPicker.color('#f43f5e') },
  { label: 'Amber', value: ColorPicker.color('#f59e0b') },
]

// The picker behind a swatch of its color, in a Popover that is a Bundle of
// its own. `ColorPicker.popover` is a value of its own file, so an inline
// picker never loads the Popover; the Popover is made with `contentFocus`,
// since the picker owns its panel's focus and a press or drag inside never
// closes it.
const App = Bundle.compose({}).pipe(
  Bundle.withChild('picker', Bundles.ColorPicker, {
    args: { id: 'brand', color: ColorPicker.color('#6366f1') },
    onOut: Bundle.ignore,
  }),
  Bundle.withChild('popover', Bundles.Popover, {
    args: { id: 'brand-popover', contentFocus: true, isAnimated: true },
    onOut: Bundle.ignore,
  }),
)

export default example({
  title: 'In a popover',
  slots: ColorPickerSlots,
  recipe: Recipes.ColorPicker,
  state: App.placements.runtime({ Model: App.Model, initial: {} }),
  view: ({ style, model, onMessage, h }) =>
    ColorPicker.popover(
      {
        model: model.picker,
        onMessage: message => onMessage(App.Message.GotPickerMessage({ message })),
        popover: model.popover,
        onPopover: message => onMessage(App.Message.GotPopoverMessage({ message })),
        label: 'Brand color',
        presets: accents,
        style,
        slider: Channel,
        popoverMixins: [Panel.mixin],
      },
      h,
    ),
})
