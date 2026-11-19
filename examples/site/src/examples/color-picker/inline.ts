import { Bundles, ColorPicker, ColorPickerSlots, Recipes } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

// The hue and alpha tracks are Sliders, painted from the color.
const Channel = Recipes.Slider.style({ track: 'paint', label: 'hidden' })

// The colors one press away: the one equal to the color is checked.
const accents: ReadonlyArray<ColorPicker.ColorPickerPreset> = [
  { label: 'Blue', value: ColorPicker.color('#3b82f6') },
  { label: 'Teal', value: ColorPicker.color('#14b8a6') },
  { label: 'Amber', value: ColorPicker.color('#f59e0b') },
  { label: 'Rose', value: ColorPicker.color('#f43f5e') },
  { label: 'Glass', value: ColorPicker.color('#3b82f680') },
]

// The color, its format and the text being typed are the Bundle's Model. It
// holds the color, so a parent that wants it reads `model.<field>.color` or
// answers `Changed` in `onOut`. `eyedropper` is false unless the application
// asks, so a server and a browser draw the same picker.
export default example({
  title: 'Inline',
  slots: ColorPickerSlots,
  recipe: Recipes.ColorPicker,
  state: Bundles.ColorPicker.with({ id: 'accent', color: ColorPicker.color('#3b82f6') }),
  view: ({ style, model, onMessage, h }) =>
    ColorPicker.view(
      { model, onMessage, label: 'Accent', presets: accents, style, slider: Channel },
      h,
    ),
})
