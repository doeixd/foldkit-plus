import { Bundles, ColorPicker, ColorPickerSlots, Recipes, SliderSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'

const Channel = forSlots(SliderSlots)(Recipes.Slider({ track: 'paint', label: 'hidden' }))

// What every picker of an application starts from: its swatches, its sliders'
// look and its words. A preset is a named set over it: the opaque one drops
// the alpha slider.
const AppPicker = ColorPicker.configure({
  base: {
    slider: Channel,
    presets: [
      { label: 'Ink', value: ColorPicker.color('#111827') },
      { label: 'Sky', value: ColorPicker.color('#0ea5e9') },
      { label: 'Lime', value: ColorPicker.color('#84cc16') },
    ],
    words: { hue: 'Tint', presets: 'Palette' },
  },
  presets: { opaque: { alpha: false } },
})

export default example({
  title: 'Configure once',
  slots: ColorPickerSlots,
  recipe: Recipes.ColorPicker,
  state: Bundles.ColorPicker.with({
    id: 'ink',
    color: ColorPicker.color('#0ea5e9'),
    format: 'rgb',
  }),
  view: ({ style, model, onMessage, h }) =>
    AppPicker.view({ model, onMessage, label: 'Ink', preset: 'opaque', style }, h),
})
